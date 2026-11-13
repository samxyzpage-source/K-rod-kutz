--[[
	Effects
	Client-only polish (nothing here affects gameplay or is seen by other players):
	  * buy buttons gently pulse so they are easy to spot
	  * a guide beam points from your character to the button for your next goal
	    (server sets the player attribute "NextGoal" to an item id)
	  * small sounds for purchases and collecting cash (Config.Sounds)
	  * game-day fans (tagged "TycoonFan" by the server) bounce and cheer - only on this
	    screen, so it costs no network traffic
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
local notifyRemote = ReplicatedStorage:WaitForChild("TycoonRemotes"):WaitForChild("Notify")

local BUTTON_TAG = "TycoonBuyButton"
local FAN_TAG = "TycoonFan"
local GUIDE_HIDE_DISTANCE = 18
local FAN_ANIMATE_DISTANCE = 260

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
-- Cheering fans
---------------------------------------------------------------------------------------------
local fans = {} -- [Model] = { parts = { {part, restingCFrame} }, phase, speed }

local function scanFan(model, entry)
	entry.parts = {}
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("BasePart") then
			table.insert(entry.parts, { descendant, descendant.CFrame })
		end
	end
end

local function trackFan(model)
	if not model:IsA("Model") then
		return
	end
	local entry = { parts = {}, phase = math.random() * math.pi * 2, speed = 5 + math.random() * 3 }
	scanFan(model, entry)
	fans[model] = entry
end

for _, model in ipairs(CollectionService:GetTagged(FAN_TAG)) do
	trackFan(model)
end
CollectionService:GetInstanceAddedSignal(FAN_TAG):Connect(trackFan)
CollectionService:GetInstanceRemovedSignal(FAN_TAG):Connect(function(model)
	fans[model] = nil
end)

local FAN_UPDATE_INTERVAL = 1 / 20 -- cheering doesn't need 60 updates a second
local nextFanUpdate = 0
local movedParts, movedCFrames = {}, {}

local function animateFans(now)
	if now < nextFanUpdate then
		return
	end
	nextFanUpdate = now + FAN_UPDATE_INTERVAL
	local camera = Workspace.CurrentCamera
	local cameraPosition = camera and camera.CFrame.Position or Vector3.new()
	table.clear(movedParts)
	table.clear(movedCFrames)
	for model, entry in pairs(fans) do
		if model.Parent == nil then
			fans[model] = nil
		else
			if #entry.parts < 2 then
				scanFan(model, entry) -- children may replicate a moment after the tag
			end
			local first = entry.parts[1]
			if first and (first[2].Position - cameraPosition).Magnitude < FAN_ANIMATE_DISTANCE then
				local lift = math.floor(math.max(0, math.sin(now * entry.speed + entry.phase)) * 9) / 10
				if lift ~= entry.lift then
					entry.lift = lift
					for _, pair in ipairs(entry.parts) do
						table.insert(movedParts, pair[1])
						table.insert(movedCFrames, pair[2] + Vector3.new(0, lift, 0))
					end
				end
			end
		end
	end
	if #movedParts > 0 then
		Workspace:BulkMoveTo(movedParts, movedCFrames, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

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
	animateFans(os.clock())
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

local function findGoalButton()
	local goal = player:GetAttribute("NextGoal")
	local plotIndex = player:GetAttribute("PlotIndex")
	if not goal or not plotIndex then
		return nil
	end
	local tycoons = Workspace:FindFirstChild("Tycoons")
	local plot = tycoons and tycoons:FindFirstChild("Plot" .. tostring(plotIndex))
	local folder = plot and plot:FindFirstChild("Buttons")
	return folder and folder:FindFirstChild("Buy_" .. tostring(goal))
end

-- Works out what the beam connects (4 times a second).
local function updateGuideTargets()
	local character = player.Character
	guideRoot = character and character:FindFirstChild("HumanoidRootPart")
	guidePad = Config.ShowGuideBeam and findGoalButton() or nil
end

-- Moves the beam ends (every frame, cheap: two property writes).
local function updateGuidePositions()
	local root, pad = guideRoot, guidePad
	if not root or not pad or root.Parent == nil or pad.Parent == nil then
		beam.Enabled = false
		return
	end
	local from = root.CFrame.Position + Vector3.new(0, -1.5, 0)
	local to = pad.CFrame.Position + Vector3.new(0, 1, 0)
	characterAttachment.Position = from
	targetAttachment.Position = to
	beam.Enabled = (from - to).Magnitude > GUIDE_HIDE_DISTANCE
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
