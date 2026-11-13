--[[
	Effects
	Client-only polish (nothing here affects gameplay or is seen by other players):
	  * buy buttons gently pulse so they are easy to spot
	  * a guide beam points from your character to the button for your next goal
	    (server sets the player attribute "NextGoal" to an item id)
	  * small sounds for purchases and collecting cash (Config.Sounds)
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
local GUIDE_HIDE_DISTANCE = 18

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

RunService.RenderStepped:Connect(function()
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

local characterAttachment = Instance.new("Attachment")
characterAttachment.Name = "TycoonGuideStart"
characterAttachment.Position = Vector3.new(0, -1.5, 0)

local targetAttachment = Instance.new("Attachment")
targetAttachment.Name = "TycoonGuideEnd"
targetAttachment.Position = Vector3.new(0, 1, 0)

beam.Attachment0 = characterAttachment
beam.Attachment1 = targetAttachment

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

local function updateGuide()
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local pad = Config.ShowGuideBeam and findGoalButton() or nil
	if not root or not pad then
		beam.Enabled = false
		return
	end
	if characterAttachment.Parent ~= root then
		characterAttachment.Parent = root
	end
	if targetAttachment.Parent ~= pad then
		targetAttachment.Parent = pad
	end
	if beam.Parent ~= root then
		beam.Parent = root
	end
	beam.Enabled = (root.CFrame.Position - pad.CFrame.Position).Magnitude > GUIDE_HIDE_DISTANCE
end

task.spawn(function()
	while true do
		updateGuide()
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
