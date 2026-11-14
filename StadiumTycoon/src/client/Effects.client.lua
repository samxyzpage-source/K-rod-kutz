--[[
	Effects
	Client-only polish (nothing here affects gameplay or is seen by other players):
	  * buy buttons gently pulse so they are easy to spot
	  * a guide beam points from your character to the button for your next goal
	    (server sets the player attribute "NextGoal" to an item id); in and around the Team HQ
	    it first points at the door or the stairs on the way (Config.Layout.HQGuide)
	  * small sounds for purchases and collecting cash (Config.Sounds)
	  * game-day fans near the camera (tagged "TycoonFan" by the server) hop and cheer - only
	    on this screen, so it costs no network traffic
]]

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))
local Items = require(Shared:WaitForChild("Items"))
local notifyRemote = ReplicatedStorage:WaitForChild("TycoonRemotes"):WaitForChild("Notify")

local BUTTON_TAG = "TycoonBuyButton"
local FAN_TAG = "TycoonFan"
local GUIDE_HIDE_DISTANCE = 18 -- the beam hides this close to its button (sideways)...
local GUIDE_SAME_FLOOR = 8 -- ... unless the button is more than this far above or below
local FAN_CHEER_DISTANCE = 140 -- only fans this close to the camera cheer (the others just sit)

---------------------------------------------------------------------------------------------
-- Pulsing buy buttons
---------------------------------------------------------------------------------------------
local buttons = {} -- [BasePart] = true

local function trackButton(pad)
	if pad:IsA("BasePart") then
		buttons[pad] = true
	end
end

for _, pad in ipairs(CollectionService:GetTagged(BUTTON_TAG)) do
	trackButton(pad)
end
CollectionService:GetInstanceAddedSignal(BUTTON_TAG):Connect(trackButton)
CollectionService:GetInstanceRemovedSignal(BUTTON_TAG):Connect(function(pad)
	buttons[pad] = nil
end)

---------------------------------------------------------------------------------------------
-- Cheering fans: a seated fan is its jersey block (the part the server tags) with its head
-- inside it. Only the fans near the camera cheer, with a simple two-state hop, from Heartbeat
-- (not RenderStepped), so two full stadiums cost little: nothing is worked out per fan when a
-- crowd arrives, and every hop moves two parts to CFrames worked out once.
---------------------------------------------------------------------------------------------
local FAN_HOP = Vector3.new(0, 0.7, 0)
local FAN_UP_ABOVE = 0.35 -- a fan is in the air while sin(...) is above this (about 40% of the time)
local FAN_UPDATE_INTERVAL = 1 / 15 -- a two-state hop needs no more updates than this
local FAN_NEAR_INTERVAL = 0.5 -- how often the list of fans near the camera is rebuilt

-- [jersey block] = { phase, speed, position (where it sits), up (in the air?), gone (removed?),
--   parts = { {part, restCFrame, raisedCFrame} } (made when the fan first comes near),
--   near = the nearStamp of the last refresh that found it near the camera }
local fans = {}
local nearFans = {} -- entries of the fans near the camera (the ones that hop)
local nearStamp = 0
local nextFanUpdate, nextNearUpdate = 0, 0
local movedParts, movedCFrames = {}, {}

local function trackFan(fan)
	if fan:IsA("BasePart") then
		fans[fan] = { phase = math.random() * math.pi * 2, speed = 5 + math.random() * 3, position = fan.CFrame.Position, up = false }
	end
end

for _, fan in ipairs(CollectionService:GetTagged(FAN_TAG)) do
	trackFan(fan)
end
CollectionService:GetInstanceAddedSignal(FAN_TAG):Connect(trackFan)
CollectionService:GetInstanceRemovedSignal(FAN_TAG):Connect(function(fan)
	local entry = fans[fan]
	if entry then
		entry.gone = true
		fans[fan] = nil
	end
end)

-- Where the fan's parts rest and where they are in the air (only while it sits, so the CFrames
-- read are the resting ones).
local function scanFan(fan, entry)
	local parts = { { fan, fan.CFrame, fan.CFrame + FAN_HOP } }
	for _, descendant in ipairs(fan:GetDescendants()) do
		if descendant:IsA("BasePart") then
			table.insert(parts, { descendant, descendant.CFrame, descendant.CFrame + FAN_HOP })
		end
	end
	entry.parts = parts
end

local function moveFan(entry, up)
	entry.up = up
	local slot = up and 3 or 2
	for _, item in ipairs(entry.parts) do
		table.insert(movedParts, item[1])
		table.insert(movedCFrames, item[slot])
	end
end

-- Rebuilds the list of fans near the camera; fans that are no longer near sit back down.
local function refreshNearFans(cameraPosition)
	nearStamp += 1
	local near = {}
	for fan, entry in pairs(fans) do
		if fan.Parent == nil then
			entry.gone = true
			fans[fan] = nil
		elseif (entry.position - cameraPosition).Magnitude < FAN_CHEER_DISTANCE then
			if not entry.parts or (#entry.parts < 2 and not entry.up) then
				scanFan(fan, entry) -- (the head may replicate a moment after the tag)
			end
			entry.near = nearStamp
			table.insert(near, entry)
		end
	end
	for _, entry in ipairs(nearFans) do
		if entry.near ~= nearStamp and entry.up and not entry.gone then
			moveFan(entry, false)
		end
	end
	nearFans = near
end

local function animateFans(now)
	if now < nextFanUpdate then
		return
	end
	nextFanUpdate = now + FAN_UPDATE_INTERVAL
	table.clear(movedParts)
	table.clear(movedCFrames)
	if now >= nextNearUpdate then
		nextNearUpdate = now + FAN_NEAR_INTERVAL
		local camera = Workspace.CurrentCamera
		refreshNearFans(camera and camera.CFrame.Position or Vector3.new())
	end
	for _, entry in ipairs(nearFans) do
		if not entry.gone then
			local up = math.sin(now * entry.speed + entry.phase) > FAN_UP_ABOVE
			if up ~= entry.up then
				moveFan(entry, up)
			end
		end
	end
	if #movedParts > 0 then
		Workspace:BulkMoveTo(movedParts, movedCFrames, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

RunService.Heartbeat:Connect(function()
	animateFans(os.clock())
end)

---------------------------------------------------------------------------------------------
-- Walking fans (game-day parade): the server sets WalkFrom/WalkTo/WalkStart/WalkDuration on
-- each walker's Root and every client moves it locally, so the walk is smooth.
---------------------------------------------------------------------------------------------
local WALKER_TAG = "TycoonWalker"
local walkers = {} -- [Model] = true

local function trackWalker(model)
	if model:IsA("Model") then
		walkers[model] = true
	end
end
for _, model in ipairs(CollectionService:GetTagged(WALKER_TAG)) do
	trackWalker(model)
end
CollectionService:GetInstanceAddedSignal(WALKER_TAG):Connect(trackWalker)
CollectionService:GetInstanceRemovedSignal(WALKER_TAG):Connect(function(model)
	walkers[model] = nil
end)

local function animateWalkers()
	local now = Workspace:GetServerTimeNow()
	for model in pairs(walkers) do
		local root = model.Parent and model:FindFirstChild("Root")
		if not root then
			if model.Parent == nil then
				walkers[model] = nil
			end
		else
			local from, to = root:GetAttribute("WalkFrom"), root:GetAttribute("WalkTo")
			local start, duration = root:GetAttribute("WalkStart"), root:GetAttribute("WalkDuration")
			if from and to and start and duration and duration > 0 then
				local alpha = math.clamp((now - start) / duration, 0, 1)
				-- a little bounce in the step
				local bob = math.abs(math.sin(alpha * duration * 8)) * 0.3
				root.CFrame = from:Lerp(to, alpha) + Vector3.new(0, bob, 0)
			end
		end
	end
end

RunService.RenderStepped:Connect(function()
	animateWalkers()
	local wave = (math.sin(os.clock() * 4) + 1) / 2 -- 0..1
	for pad in pairs(buttons) do
		if pad.Parent then
			pad.LocalTransparencyModifier = wave * 0.45
			local info = pad:FindFirstChild("Info")
			if info and info:IsA("BillboardGui") then
				info.StudsOffset = Vector3.new(0, 4.5 + wave * 0.6, 0)
			end
		else
			buttons[pad] = nil
		end
	end
end)

---------------------------------------------------------------------------------------------
-- Guide beam to the next goal
---------------------------------------------------------------------------------------------
-- The beam and its two attachments live under Terrain (which is never destroyed) and are moved
-- every frame, so destroyed buttons or respawned characters can never break the guide.
local guideAnchor = Workspace:FindFirstChildOfClass("Terrain") or Workspace

local characterAttachment = Instance.new("Attachment")
characterAttachment.Name = "TycoonGuideStart"
characterAttachment.Parent = guideAnchor

local targetAttachment = Instance.new("Attachment")
targetAttachment.Name = "TycoonGuideEnd"
targetAttachment.Parent = guideAnchor

local beam = Instance.new("Beam")
beam.Name = "TycoonGuide"
beam.FaceCamera = true
beam.Width0 = 0.6
beam.Width1 = 0.6
beam.Segments = 1
beam.LightEmission = 1
beam.LightInfluence = 0
beam.Color = ColorSequence.new(Color3.fromRGB(255, 220, 60))
beam.Transparency = NumberSequence.new({
	NumberSequenceKeypoint.new(0, 0.2),
	NumberSequenceKeypoint.new(1, 0.6),
})
beam.Enabled = false
beam.Attachment0 = characterAttachment
beam.Attachment1 = targetAttachment
beam.Parent = guideAnchor

local guideRoot = nil -- the character's HumanoidRootPart
local guidePad = nil -- the button the beam points at
local guideVia = nil -- (world) where the beam points first on the way there, nil = the button itself

---------------------------------------------------------------------------------------------
-- Waypoints in and around the Team HQ (Config.Layout.HQGuide, campus coordinates): a straight
-- beam can't be followed through the HQ's walls and floors, so there it first points at a door,
-- the stairs, a corner of the building or the lobby's opening onto the corridor.
---------------------------------------------------------------------------------------------
local GUIDE = Config.Layout.HQGuide
local CAMPUS = Config.Layout.Areas.campus
local ROOT_HEIGHT = 3 -- a character's HumanoidRootPart is about this high above its feet

local function inBox(box, p)
	return p.X >= box.MinX
		and p.X <= box.MaxX
		and p.Z >= box.MinZ
		and p.Z <= box.MaxZ
		and (box.MinY == nil or (p.Y >= box.MinY and p.Y <= box.MaxY))
end

-- nil (outside the HQ), "down" / "up" (ground / upper floor) or "roof"
local function hqLevel(p)
	for _, box in ipairs(GUIDE.Building) do
		if inBox(box, p) then
			if p.Y > GUIDE.RoofY then
				return "roof"
			end
			return p.Y >= GUIDE.UpstairsY and "up" or "down"
		end
	end
	return nil
end

-- Does the line a-b (seen from above) pass through the box (by default the HQ block)?
local function crossesBlock(a, b, block)
	block = block or GUIDE.Block
	local dx, dz = b.X - a.X, b.Z - a.Z
	local t0, t1 = 0, 1
	local function clip(p, q)
		if p == 0 then
			return q >= 0
		end
		if p < 0 then
			t0 = math.max(t0, q / p)
		else
			t1 = math.min(t1, q / p)
		end
		return t0 < t1
	end
	return clip(-dx, a.X - block.MinX) and clip(dx, block.MaxX - a.X) and clip(-dz, a.Z - block.MinZ) and clip(dz, block.MaxZ - a.Z)
end

local CORNERS -- the block's corners (CornerMargin out), in order round it
do
	local block, margin = GUIDE.Block, GUIDE.CornerMargin
	local x0, x1, z0, z1 = block.MinX - margin, block.MaxX + margin, block.MinZ - margin, block.MaxZ + margin
	CORNERS = { Vector3.new(x0, 0.2, z0), Vector3.new(x1, 0.2, z0), Vector3.new(x1, 0.2, z1), Vector3.new(x0, 0.2, z1) }
end

-- ... or through the building itself (its boxes, a stud bigger: clear of its corner columns)?
local PADDED_BUILDING = {}
for _, box in ipairs(GUIDE.Building) do
	table.insert(PADDED_BUILDING, { MinX = box.MinX - 1, MaxX = box.MaxX + 1, MinZ = box.MinZ - 1, MaxZ = box.MaxZ + 1 })
end
local function crossesBuilding(a, b)
	for _, box in ipairs(PADDED_BUILDING) do
		if crossesBlock(a, b, box) then
			return true
		end
	end
	return false
end

-- A spot on the ground in the block but outside the building (the strips beside it: the covered HQ
-- walk, beside the west wall, behind the back wall): the nearest point just outside the block.
local function stepOut(p)
	local block, margin = GUIDE.Block, GUIDE.CornerMargin
	if p.Y >= GUIDE.UpstairsY or p.X <= block.MinX or p.X >= block.MaxX or p.Z <= block.MinZ or p.Z >= block.MaxZ then
		return nil
	end
	local best, out = p.X - block.MinX, Vector3.new(block.MinX - margin, 0.2, p.Z)
	if block.MaxX - p.X < best then
		best, out = block.MaxX - p.X, Vector3.new(block.MaxX + margin, 0.2, p.Z)
	end
	if p.Z - block.MinZ < best then
		best, out = p.Z - block.MinZ, Vector3.new(p.X, 0.2, block.MinZ - margin)
	end
	if block.MaxZ - p.Z < best then
		out = Vector3.new(p.X, 0.2, block.MaxZ + margin)
	end
	return out
end

-- The shortest way from a to b (both outside the building) round the HQ block: the first point to
-- walk to (b itself, a corner, or the way out of a strip beside the building) and the length.
local function aroundBlock(a, b)
	local out, into = stepOut(a), stepOut(b)
	if out or into then
		if not crossesBuilding(a, b) then
			return b, (b - a).Magnitude
		elseif out then
			local _, rest = aroundBlock(out, b)
			return out, (out - a).Magnitude + rest
		end
		local first, rest = aroundBlock(a, into)
		return first, rest + (b - into).Magnitude
	end
	if not crossesBlock(a, b) then
		return b, (b - a).Magnitude
	end
	local first, best = b, math.huge
	for start = 1, 4 do
		for _, turn in ipairs({ 1, 3 }) do -- (one way or the other round the block)
			local from, index, length = a, start, 0
			for _ = 1, 3 do
				local corner = CORNERS[index]
				if crossesBlock(from, corner) then
					break
				end
				length += (corner - from).Magnitude
				if not crossesBlock(corner, b) then
					length += (b - corner).Magnitude
					if length < best then
						first, best = CORNERS[start], length
					end
					break
				end
				from, index = corner, (index + turn - 1) % 4 + 1
			end
		end
	end
	if best == math.huge then
		return b, (b - a).Magnitude
	end
	return first, best
end

-- Inside, goal outside: the door whose way out (to it, then round the block) is shortest; first
-- the spot just inside it, then (a little before you get there) through it.
local function wayOut(p, goal)
	local target, best = nil, math.huge
	for _, door in ipairs(GUIDE.Doors) do
		local _, outside = aroundBlock(door.Outside, goal)
		local length = (door.Outside - p).Magnitude + outside
		if length < best then
			best = length
			local atDoor = (door.Outside - p).Magnitude <= (door.Outside - door.Inside).Magnitude + 2
			target = atDoor and door.Outside or door.Inside
		end
	end
	return target
end

-- Outside, goal inside: round the block to the door with the shortest way in, then through it
-- (once you stand in front of it: lined up with it, at most 2.5 studs short of the spot outside it,
-- so the beam never cuts across the wall or glass beside a door when you come along the wall).
local function wayIn(p, goal)
	local target, best = nil, math.huge
	for _, door in ipairs(GUIDE.Doors) do
		local first, outside = aroundBlock(p, door.Outside)
		local length = outside + (goal - door.Inside).Magnitude
		if length < best then
			best = length
			local axis = (door.Inside - door.Outside).Unit
			local along = (p - door.Outside):Dot(axis)
			local atDoor = along >= -2.5 and (p - door.Outside - axis * along).Magnitude <= 4
			target = atDoor and door.Inside or first
		end
	end
	return target
end

local function usable(stair, built)
	return stair.Piece == nil or built(stair.Piece)
end

-- On a stair: the next point toward the goal's floor (nil = not on this stair, or already off it
-- at that end).
local function alongStair(stair, p, up)
	for _, leg in ipairs(stair.Legs) do
		if inBox(leg, p) then
			if up then
				return leg.Up
			end
			return leg.Down
		end
	end
	return nil
end

-- Off the stairs: where to step on (up: the bottom, or the door of the stair's room first;
-- down: the top) for the stair that makes the walk to the goal shortest.
local function toStairs(p, goal, up, built)
	local target, best = nil, math.huge
	for _, stair in ipairs(GUIDE.Stairs) do
		if usable(stair, built) then
			local entry, leave = stair.Bottom, stair.Top
			if not up then
				entry, leave = leave, entry
			elseif stair.Room and not inBox(stair.Room, p) then
				entry = stair.Door
			end
			local length = (entry - p).Magnitude + (goal - leave).Magnitude
			if length < best then
				target, best = entry, length
			end
		end
	end
	return target
end

-- In the lobby off its lane: where to walk first to get onto the lane (Config: Lobby.ToLane).
local function toLane(lobby, p)
	for _, way in ipairs(lobby.ToLane) do
		if inBox(way, p) then
			return way.Point
		end
	end
	return lobby.Hub
end

-- On the ground floor the lobby (with the main entrance) only opens onto the corridor, and its
-- furniture leaves one clear lane between the two: between the lobby and the rest of the HQ the
-- beam leads through that lane (out: onto the lane, then just past it into the corridor; in: along
-- the corridor to the lane, then just past it into the lobby). Inside the lobby it leads from the
-- lane down into the lobby's front half through the Hub, in from the doors past the plants beside
-- them, from the reception side across the lobby by the lane, and out of the strips behind the
-- Team Wall and the trophy case onto the corridor. (Anywhere on the ground floor: the ground floors
-- of the two towers at the corridor's ends lead to the lobby by the corridor too.)
local function viaLobby(p, target)
	local lobby = GUIDE.Lobby
	if target.Y >= GUIDE.UpstairsY or hqLevel(p) ~= "down" then
		return target
	end
	local inLobby, targetInLobby = inBox(lobby, p), inBox(lobby, target)
	if inLobby then
		for _, pocket in ipairs(lobby.Pockets) do
			if inBox(pocket, p) and not inBox(pocket, target) then
				return Vector3.new(p.X, 0.2, lobby.MaxZ + 3)
			end
		end
		if targetInLobby then
			if p.Z > lobby.FrontZ and target.Z < lobby.FrontZ then
				return lobby.Hub
			elseif inBox(lobby.Doorway, p) and (target.X < lobby.Doorway.MinX or target.X > lobby.Doorway.MaxX) then
				return lobby.Doorway.Point
			elseif p.X < lobby.OpenMinX and target.X >= lobby.OpenMinX then
				return toLane(lobby, p)
			end
			return target
		elseif p.X >= lobby.OpenMinX and p.X <= lobby.OpenMaxX then
			return Vector3.new(p.X, 0.2, lobby.MaxZ + 3)
		end
		return toLane(lobby, p)
	elseif not targetInLobby then
		return target
	end
	-- (the turn into the lane comes a little before its edge, so the beam never hides there)
	local x = math.clamp(p.X, lobby.OpenMinX, lobby.OpenMaxX)
	local atLane = math.abs(x - p.X) < 2.5 and p.Z >= lobby.MaxZ and p.Z <= Config.Layout.HQCorridor.MaxZ
	return Vector3.new(x, 0.2, atLane and lobby.MaxZ - 3 or lobby.OpenZ)
end

-- Where the beam points first (campus coordinates), or nil: straight at the goal.
-- p = the player's feet, goal = the goal button's spot, built(itemId) = is that step built?
local function guideWaypoint(p, goal, built)
	local playerLevel, goalLevel = hqLevel(p), hqLevel(goal)
	if playerLevel == "roof" or goalLevel == "roof" then
		return nil
	elseif not playerLevel then
		if goalLevel then
			for _, bridge in ipairs(GUIDE.Bridges) do
				if inBox(bridge, p) then
					return bridge.Door -- up on a skybridge: in through the prompt at its HQ end
				end
			end
			return wayIn(p, goal)
		end
		local first = aroundBlock(p, goal)
		return first ~= goal and first or nil
	end
	local up = goalLevel == "up"
	local target = nil
	for _, stair in ipairs(GUIDE.Stairs) do
		target = target or (usable(stair, built) and alongStair(stair, p, up)) or nil
	end
	if not target then
		if (playerLevel == "up") ~= up then
			target = toStairs(p, goal, up, built) -- the other floor (or outside, from upstairs)
		elseif goalLevel then
			target = goal -- the same floor
		else
			target = wayOut(p, goal)
		end
	end
	target = viaLobby(p, target or goal)
	return target ~= goal and target or nil
end

local function findGoal()
	local goal = player:GetAttribute("NextGoal")
	local plotIndex = player:GetAttribute("PlotIndex")
	if not goal or not plotIndex then
		return nil
	end
	local tycoons = Workspace:FindFirstChild("Tycoons")
	local plot = tycoons and tycoons:FindFirstChild("Plot" .. tostring(plotIndex))
	local folder = plot and plot:FindFirstChild("Buttons")
	local pad = folder and folder:FindFirstChild("Buy_" .. tostring(goal))
	return pad, plot, Items.ById[goal]
end

-- Works out what the beam connects (4 times a second).
local function updateGuideTargets()
	local character = player.Character
	guideRoot = character and character:FindFirstChild("HumanoidRootPart")
	guidePad, guideVia = nil, nil
	if not Config.ShowGuideBeam then
		return
	end
	local pad, plot, item = findGoal()
	guidePad = pad
	if not pad or not guideRoot or not item then
		return
	end
	-- the plot's frame, from the button (it stands 0.3 above the item's Button spot)
	local button = item.Button
	local origin = pad.CFrame * CFrame.new(-button.X, -button.Y - 0.3, -button.Z)
	local feet = origin:PointToObjectSpace(guideRoot.CFrame.Position) - CAMPUS - Vector3.new(0, ROOT_HEIGHT, 0)
	local items = plot:FindFirstChild("Items")
	local via = guideWaypoint(feet, button - CAMPUS, function(itemId)
		return items ~= nil and items:FindFirstChild(itemId) ~= nil
	end)
	if via then
		guideVia = origin * (via + CAMPUS + Vector3.new(0, 1, 0))
	end
end

-- Moves the beam ends (every frame, cheap: two property writes).
local function updateGuidePositions()
	local root, pad = guideRoot, guidePad
	if not root or not pad or root.Parent == nil or pad.Parent == nil then
		beam.Enabled = false
		return
	end
	local from = root.CFrame.Position + Vector3.new(0, -1.5, 0)
	local to = guideVia or (pad.CFrame.Position + Vector3.new(0, 1, 0))
	characterAttachment.Position = from
	targetAttachment.Position = to
	local gap = to - from
	if guideVia then
		beam.Enabled = gap.Magnitude > 2
	else
		-- hidden right by the button, but not when it is on another floor above or below you
		beam.Enabled = Vector3.new(gap.X, 0, gap.Z).Magnitude > GUIDE_HIDE_DISTANCE or math.abs(gap.Y) > GUIDE_SAME_FLOOR
	end
end

RunService.RenderStepped:Connect(updateGuidePositions)

task.spawn(function()
	while true do
		local ok, err = pcall(updateGuideTargets)
		if not ok then
			warn("[Effects] guide beam: " .. tostring(err))
		end
		task.wait(0.25)
	end
end)

---------------------------------------------------------------------------------------------
-- Sounds
---------------------------------------------------------------------------------------------
local soundsFolder = Instance.new("Folder")
soundsFolder.Name = "TycoonSounds"
soundsFolder.Parent = SoundService

local function makeSound(name, settings)
	if type(settings) ~= "table" or type(settings.Id) ~= "string" or settings.Id == "" then
		return nil
	end
	local sound = Instance.new("Sound")
	sound.Name = name
	sound.SoundId = settings.Id
	sound.Volume = settings.Volume or 0.5
	sound.PlaybackSpeed = settings.Speed or 1
	sound.Parent = soundsFolder
	return sound
end

local soundsConfig = Config.Sounds or {}
local soundForKind = {
	success = makeSound("Purchase", soundsConfig.Purchase),
	cash = makeSound("Collect", soundsConfig.Collect),
	error = makeSound("Error", soundsConfig.Error),
}

notifyRemote.OnClientEvent:Connect(function(_message, kind)
	local sound = soundForKind[kind]
	if sound then
		SoundService:PlayLocalSound(sound)
	end
end)
