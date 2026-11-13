--[[
	PlayerData
	Loads, holds and saves each player's progress (cash + which stadium pieces they own).

	Saving uses a DataStore. It only works when:
	  * the place is published (File > Publish to Roblox), and
	  * in Studio: Game Settings > Security > "Enable Studio Access to API Services" is ON.
	If saving is not available the game still works, progress just isn't kept.

	A light "session lock" stops two servers from overwriting each other's saves when a player
	quickly hops from one server to another.

	Player attributes set here (read by the HUD):
	  Cash        current cash
	  SaveStatus  "loading" | "on" | "off"
]]

local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Items = require(Shared:WaitForChild("Items"))

local PlayerData = {}

local DATA_VERSION = 1
local LOCK_TIMEOUT = 300 -- a session lock older than this (seconds) is considered dead
local LOCK_WAIT_ATTEMPTS = 6 -- how many times to wait for another server to release the lock
local LOCK_WAIT_SECONDS = 4
local REQUEST_RETRIES = 3

local profiles = {} -- [Player] = profile
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
		Cash = Config.StartingCash,
		Owned = {},
		CanSave = false,
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
			if type(id) == "string" and Items.ById[id] then
				profile.Owned[id] = true
			end
		end
	end
end

local function serialize(profile)
	local owned = {}
	for id in pairs(profile.Owned) do
		table.insert(owned, id)
	end
	table.sort(owned)
	return {
		Version = DATA_VERSION,
		Cash = math.floor(profile.Cash),
		Owned = owned,
		SavedAt = os.time(),
	}
end

local function lockIsHeldByOtherServer(data)
	if type(data) ~= "table" or type(data.Session) ~= "table" then
		return false
	end
	local session = data.Session
	if session.JobId == game.JobId then
		return false
	end
	return isNumber(session.Time) and os.time() - session.Time < LOCK_TIMEOUT
end

-- Errors that will never go away by retrying (e.g. Studio API access is switched off).
local function isPermanentError(message)
	message = tostring(message)
	return message:find("StudioAccessToApisNotAllowed", 1, true) ~= nil
		or message:find("API Services", 1, true) ~= nil
		or message:find("403", 1, true) ~= nil
		or message:find("publish", 1, true) ~= nil
end

-- Runs a DataStore request with retries. Returns success, result.
local function withRetries(description, callback)
	local lastError
	for attempt = 1, REQUEST_RETRIES do
		local ok, result = pcall(callback)
		if ok then
			return true, result
		end
		lastError = result
		warn(("[PlayerData] %s failed (attempt %d/%d): %s"):format(description, attempt, REQUEST_RETRIES, tostring(result)))
		if isPermanentError(result) then
			warn(
				"[PlayerData] Saving is turned off for this server. In Studio, enable Game Settings > Security > 'Enable Studio Access to API Services'."
			)
			store = nil
			break
		end
		if attempt < REQUEST_RETRIES then
			task.wait(attempt * 2)
		end
	end
	return false, lastError
end

-- Loads (and session-locks) a player's data. Yields. Returns the profile, or nil if the player left.
function PlayerData.Load(player)
	if profiles[player] then
		return profiles[player]
	end
	player:SetAttribute("SaveStatus", "loading")
	local profile = newProfile(player.UserId)

	if store then
		local loaded = false
		local requestFailed = false
		for lockAttempt = 1, LOCK_WAIT_ATTEMPTS + 1 do
			local forceSteal = lockAttempt > LOCK_WAIT_ATTEMPTS
			local lockedElsewhere = false
			local savedData = nil
			local ok = withRetries("Load " .. profile.Key, function()
				return store:UpdateAsync(profile.Key, function(old)
					if not forceSteal and lockIsHeldByOtherServer(old) then
						lockedElsewhere = true
						return nil -- don't write; another server still owns this data
					end
					lockedElsewhere = false
					local data = type(old) == "table" and old or {}
					data.Session = { JobId = game.JobId, Time = os.time() }
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
		profile.CanSave = loaded and not requestFailed
	end

	if player.Parent == nil then
		-- The player left while we were loading: give the lock back without touching their data.
		if profile.CanSave then
			profile.Released = true
			task.spawn(function()
				withRetries("Unlock " .. profile.Key, function()
					return store:UpdateAsync(profile.Key, function(old)
						if type(old) == "table" and type(old.Session) == "table" and old.Session.JobId == game.JobId then
							old.Session = nil
							return old
						end
						return nil
					end)
				end)
			end)
		end
		return nil
	end

	profiles[player] = profile
	player:SetAttribute("Cash", profile.Cash)
	player:SetAttribute("SaveStatus", profile.CanSave and "on" or "off")
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
	profile.Saving = true
	local changesAtSave = profile.Changes
	local data = serialize(profile)
	local stolen = false
	local ok = withRetries("Save " .. profile.Key, function()
		return store:UpdateAsync(profile.Key, function(old)
			if lockIsHeldByOtherServer(old) then
				stolen = true
				return nil -- another server took over this player's data; don't overwrite it
			end
			stolen = false
			data.Session = (not release) and { JobId = game.JobId, Time = os.time() } or nil
			return data
		end)
	end)
	profile.Saving = false
	if ok and not stolen then
		profile.SavedChanges = math.max(profile.SavedChanges, changesAtSave)
		return true
	end
	if stolen then
		warn("[PlayerData] " .. profile.Key .. " is now owned by another server; this server will stop saving it.")
		profile.CanSave = false
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
	saveProfile(profile, true)
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
	while next(profiles) ~= nil and os.clock() < deadline do
		task.wait(0.1)
	end
end

-- Periodically saves every profile (this also refreshes the session lock).
function PlayerData.StartAutosave()
	if not store then
		return
	end
	task.spawn(function()
		while true do
			task.wait(Config.AutosaveSeconds)
			for _, profile in pairs(profiles) do
				if not profile.Released and profile.CanSave then
					task.spawn(saveProfile, profile, false)
				end
			end
		end
	end)
end

function PlayerData.IsSavingAvailable()
	return store ~= nil
end

return PlayerData
