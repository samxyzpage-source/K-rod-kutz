--[[
	PlayerData
	Loads, holds and saves each player's progress (cash + which stadium pieces they own).

	Saving uses a DataStore. It only works when:
	  * the place is published (File > Publish to Roblox), and
	  * in Studio: Game Settings > Security > "Enable Studio Access to API Services" is ON.
	If saving is not available the game still works, progress just isn't kept.

	A "session lock" (a unique id per load, stored with the save) stops two servers - or a
	quick leave-and-rejoin on the same server - from overwriting each other's saves.

	Player attributes set here (read by the HUD):
	  Cash        current cash
	  SaveStatus  "loading" | "on" | "off" | "loadfailed"
]]

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Items = require(Shared:WaitForChild("Items"))

local PlayerData = {}

local DATA_VERSION = 1
local LOCK_TIMEOUT = 300 -- a session lock older than this (seconds) is considered dead
local LOCK_WAIT_ATTEMPTS = 6 -- how many times to wait for another server to release the lock
local LOCK_WAIT_SECONDS = 4
local REQUEST_RETRIES = 3
local MAX_UNKNOWN_IDS = 200

local profiles = {} -- [Player] = profile
local releasing = {} -- [userId] = true while that user's final save / unlock is running
local inFlight = 0 -- loads + unlocks still talking to the DataStore (shutdown waits for these)
local store = nil

if Config.SaveEnabled then
	if game.GameId == 0 then
		warn(
			"[PlayerData] This place is not published, so progress will NOT be saved. Publish it and enable Studio API access to test saving."
		)
	else
		local ok, result = pcall(function()
			return DataStoreService:GetDataStore(Config.DataStoreName)
		end)
		if ok then
			store = result
		else
			warn("[PlayerData] DataStores unavailable, progress will NOT be saved: " .. tostring(result))
		end
	end
end

local function keyFor(userId)
	return "Player_" .. tostring(userId)
end

local function newProfile(userId)
	return {
		Key = keyFor(userId),
		UserId = userId,
		SessionId = HttpService:GenerateGUID(false),
		Cash = Config.StartingCash,
		Owned = {},
		UnknownOwned = {}, -- saved item ids this server doesn't know (e.g. from a newer version); kept as-is
		CanSave = false,
		LoadFailed = false,
		Changes = 0, -- bumped on every change
		SavedChanges = 0, -- value of Changes at the last successful save
		Saving = false,
		Released = false,
	}
end

local function isNumber(value)
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

-- Copies saved data into a fresh profile, ignoring anything unexpected.
local function applySavedData(profile, data)
	if type(data) ~= "table" then
		return
	end
	if isNumber(data.Cash) and data.Cash >= 0 then
		profile.Cash = math.floor(data.Cash)
	end
	if type(data.Owned) == "table" then
		for _, id in ipairs(data.Owned) do
			if type(id) == "string" then
				if Items.ById[id] then
					profile.Owned[id] = true
				elseif #profile.UnknownOwned < MAX_UNKNOWN_IDS then
					table.insert(profile.UnknownOwned, id)
				end
			end
		end
	end
end

-- Builds the table to save. Fields this version doesn't know about (from `old`) are kept.
local function serialize(profile, old)
	local data = {}
	if type(old) == "table" then
		for key, value in pairs(old) do
			data[key] = value
		end
	end
	local owned = {}
	for id in pairs(profile.Owned) do
		table.insert(owned, id)
	end
	for _, id in ipairs(profile.UnknownOwned) do
		if not profile.Owned[id] then
			table.insert(owned, id)
		end
	end
	table.sort(owned)
	data.Version = DATA_VERSION
	data.Cash = math.floor(profile.Cash)
	data.Owned = owned
	data.SavedAt = os.time()
	return data
end

local function newSession(profile)
	return { JobId = game.JobId, Id = profile.SessionId, Time = os.time() }
end

-- True if some other session (another server, or an earlier session on this server) still owns the data.
local function lockedByOtherSession(data, sessionId)
	if type(data) ~= "table" or type(data.Session) ~= "table" then
		return false
	end
	local session = data.Session
	if session.Id == sessionId then
		return false
	end
	if RunService:IsStudio() and session.JobId == "" then
		return false -- a lock left behind by an earlier Studio test session
	end
	return isNumber(session.Time) and os.time() - session.Time < LOCK_TIMEOUT
end

local function isNewerVersion(data)
	return type(data) == "table" and isNumber(data.Version) and data.Version > DATA_VERSION
end

-- Errors that can never succeed by retrying. Only Studio produces these
-- (API access switched off, or the place isn't published).
local function isPermanentError(message)
	message = tostring(message)
	return message:find("StudioAccessToApisNotAllowed", 1, true) ~= nil
		or message:find("Studio access to APIs", 1, true) ~= nil
		or message:find("must publish", 1, true) ~= nil
end

local function disableSaving(reason)
	if not store then
		return
	end
	warn("[PlayerData] Saving is turned off for this server: " .. reason)
	store = nil
	for player, profile in pairs(profiles) do
		profile.CanSave = false
		player:SetAttribute("SaveStatus", "off")
	end
end

-- Runs a DataStore request with retries. Returns success, result.
local function withRetries(description, callback)
	local lastError
	for attempt = 1, REQUEST_RETRIES do
		if not store then
			return false, "saving is disabled"
		end
		local ok, result = pcall(callback)
		if ok then
			return true, result
		end
		lastError = result
		warn(("[PlayerData] %s failed (attempt %d/%d): %s"):format(description, attempt, REQUEST_RETRIES, tostring(result)))
		if RunService:IsStudio() and isPermanentError(result) then
			disableSaving("in Studio, enable Game Settings > Security > 'Enable Studio Access to API Services'.")
			break
		end
		if attempt < REQUEST_RETRIES then
			task.wait(attempt * 2)
		end
	end
	return false, lastError
end

-- Gives the session lock back without changing anything else (only if we still hold it).
-- (the caller raises inFlight before spawning this)
local function unlock(profile)
	releasing[profile.UserId] = true
	withRetries("Unlock " .. profile.Key, function()
		return store:UpdateAsync(profile.Key, function(old)
			if type(old) == "table" and type(old.Session) == "table" and old.Session.Id == profile.SessionId then
				old.Session = nil
				return old
			end
			return nil
		end)
	end)
	releasing[profile.UserId] = nil
	inFlight -= 1
end

local loadProfile -- defined below

-- Loads (and session-locks) a player's data. Yields. Returns the profile, or nil if the player left.
function PlayerData.Load(player)
	if profiles[player] then
		return profiles[player]
	end
	inFlight += 1
	local ok, result = pcall(loadProfile, player)
	inFlight -= 1
	if not ok then
		warn("[PlayerData] Loading failed: " .. tostring(result))
		return nil
	end
	return result
end

loadProfile = function(player)
	player:SetAttribute("SaveStatus", "loading")
	local profile = newProfile(player.UserId)

	-- If this player just left this server and their final save is still running, wait for it
	-- so we read the newest data.
	while releasing[player.UserId] and player.Parent ~= nil do
		task.wait(0.1)
	end
	if player.Parent == nil then
		return nil -- left before we even started: don't take a lock
	end

	if store then
		local loaded = false
		local requestFailed = false
		local tooNew = false
		for lockAttempt = 1, LOCK_WAIT_ATTEMPTS + 1 do
			local forceSteal = lockAttempt > LOCK_WAIT_ATTEMPTS
			local lockedElsewhere = false
			local savedData = nil
			local ok = withRetries("Load " .. profile.Key, function()
				return store:UpdateAsync(profile.Key, function(old)
					lockedElsewhere, tooNew = false, false
					if isNewerVersion(old) then
						tooNew = true
						savedData = old
						return nil -- saved by a newer version of the game: read it, never write it
					end
					if not forceSteal and lockedByOtherSession(old, profile.SessionId) then
						lockedElsewhere = true
						return nil -- don't write; another session still owns this data
					end
					local data = type(old) == "table" and old or {}
					data.Session = newSession(profile)
					savedData = data
					return data
				end)
			end)
			if not ok then
				requestFailed = true
				break
			end
			if not lockedElsewhere then
				applySavedData(profile, savedData)
				loaded = true
				break
			end
			if player.Parent == nil then
				break
			end
			task.wait(LOCK_WAIT_SECONDS)
		end
		profile.CanSave = loaded and not requestFailed and not tooNew and store ~= nil
		profile.LoadFailed = requestFailed and store ~= nil
		if tooNew then
			warn("[PlayerData] " .. profile.Key .. " was saved by a newer version of the game; this server won't save it.")
		end
	end

	if player.Parent == nil then
		-- The player left while we were loading: give the lock back without touching their data.
		if profile.CanSave then
			profile.Released = true
			inFlight += 1
			task.spawn(unlock, profile)
		end
		return nil
	end
	profile.Player = player

	profiles[player] = profile
	player:SetAttribute("Cash", profile.Cash)
	if profile.LoadFailed then
		player:SetAttribute("SaveStatus", "loadfailed")
	else
		player:SetAttribute("SaveStatus", profile.CanSave and "on" or "off")
	end
	return profile
end

-- Saves a profile. `release` = true also gives up the session lock (used when the player leaves).
local function saveProfile(profile, release)
	if not store or not profile.CanSave then
		return false
	end
	while profile.Saving do
		task.wait(0.1)
	end
	if not store or not profile.CanSave or (profile.Released and not release) then
		return false -- (an autosave that was queued behind the final save has nothing left to do)
	end
	profile.Saving = true
	local changesAtSave = profile.Changes
	local lost = false
	local ok = withRetries("Save " .. profile.Key, function()
		return store:UpdateAsync(profile.Key, function(old)
			if type(old) ~= "table" or type(old.Session) ~= "table" or old.Session.Id ~= profile.SessionId then
				lost = true
				return nil -- another session owns this data now; never overwrite it
			end
			lost = false
			local data = serialize(profile, old)
			data.Session = (not release) and newSession(profile) or nil
			return data
		end)
	end)
	profile.Saving = false
	if ok and not lost then
		profile.SavedChanges = math.max(profile.SavedChanges, changesAtSave)
		return true
	end
	if lost then
		warn("[PlayerData] " .. profile.Key .. " is owned by another session now; this server will stop saving it.")
		profile.CanSave = false
		if profile.Player and profile.Player.Parent ~= nil then
			profile.Player:SetAttribute("SaveStatus", "off")
		end
	end
	return false
end

-- Waits (up to timeout seconds) for a player's profile to finish loading.
function PlayerData.WaitForProfile(player, timeout)
	local deadline = os.clock() + (timeout or 30)
	while not profiles[player] and player.Parent ~= nil and os.clock() < deadline do
		task.wait(0.1)
	end
	return profiles[player]
end

function PlayerData.GetProfile(player)
	return profiles[player]
end

function PlayerData.GetCash(player)
	local profile = profiles[player]
	return profile and profile.Cash or 0
end

local function markChanged(player, profile)
	profile.Changes += 1
	player:SetAttribute("Cash", profile.Cash)
end

function PlayerData.AddCash(player, amount)
	local profile = profiles[player]
	if not profile or not isNumber(amount) then
		return false
	end
	profile.Cash = math.max(0, math.floor(profile.Cash + amount))
	markChanged(player, profile)
	return true
end

-- Takes `amount` from the player's cash if they have enough. Returns true on success.
function PlayerData.TrySpend(player, amount)
	local profile = profiles[player]
	if not profile or not isNumber(amount) or amount < 0 or profile.Cash < amount then
		return false
	end
	profile.Cash -= amount
	markChanged(player, profile)
	return true
end

function PlayerData.SetOwned(player, itemId)
	local profile = profiles[player]
	if not profile then
		return false
	end
	profile.Owned[itemId] = true
	markChanged(player, profile)
	return true
end

function PlayerData.Save(player)
	local profile = profiles[player]
	if not profile then
		return false
	end
	return saveProfile(profile, false)
end

-- Final save + unlock when a player leaves.
function PlayerData.Release(player)
	local profile = profiles[player]
	if not profile or profile.Released then
		return
	end
	profile.Released = true
	releasing[profile.UserId] = true
	saveProfile(profile, true)
	releasing[profile.UserId] = nil
	profiles[player] = nil
end

-- Saves everyone in parallel and waits up to `timeout` seconds (used when the server shuts down).
-- Also waits for saves that PlayerRemoving already started, so the server doesn't close mid-save.
function PlayerData.ReleaseAll(timeout)
	for player, profile in pairs(profiles) do
		if not profile.Released then
			task.spawn(PlayerData.Release, player)
		end
	end
	local deadline = os.clock() + (timeout or 25)
	while (next(profiles) ~= nil or inFlight > 0) and os.clock() < deadline do
		task.wait(0.1)
	end
end

-- Periodically saves every profile (this also refreshes the session lock).
function PlayerData.StartAutosave()
	task.spawn(function()
		while true do
			task.wait(Config.AutosaveSeconds)
			if store then
				for _, profile in pairs(profiles) do
					if not profile.Released and profile.CanSave then
						task.spawn(saveProfile, profile, false)
					end
				end
			end
		end
	end)
end

function PlayerData.IsSavingAvailable()
	return store ~= nil
end

return PlayerData
