--[[
	Gridiron Stadium Tycoon - server entry point.

	Builds the world and the plots, loads/saves player data and starts the game loops.
	Tweak gameplay numbers in ReplicatedStorage > TycoonShared > Config and Items.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage:WaitForChild("TycoonShared"):WaitForChild("Config"))
local World = require(script.Parent.World)
local PlayerData = require(script.Parent.PlayerData)
local PlotManager = require(script.Parent.PlotManager)
local GameDay = require(script.Parent.GameDay)

-- Remote used to show messages on players' screens
local remotes = Instance.new("Folder")
remotes.Name = "TycoonRemotes"
local notifyRemote = Instance.new("RemoteEvent")
notifyRemote.Name = "Notify"
notifyRemote.Parent = remotes
remotes.Parent = ReplicatedStorage

-- World + plots
World.Build(Config)
local tycoonsFolder = Instance.new("Folder")
tycoonsFolder.Name = "Tycoons"
tycoonsFolder.Parent = Workspace
PlotManager.Init(tycoonsFolder, notifyRemote)
GameDay.Init(tycoonsFolder, PlotManager)
World.StartDayNight(Config, PlotManager.SetNight)

-- Players
local function onPlayerAdded(player)
	PlotManager.OnPlayerAdded(player)
	local profile = PlayerData.Load(player)
	if profile and profile.LoadFailed then
		notifyRemote:FireClient(
			player,
			"We couldn't load your saved stadium right now. Your save is safe - rejoin in a few minutes to get it back.",
			"error"
		)
	elseif profile and not profile.CanSave and Config.SaveEnabled then
		notifyRemote:FireClient(player, "Saving is off in this server, so progress won't be kept.", "info")
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	PlotManager.Release(player) -- pays out the vault into the player's cash
	PlayerData.Release(player) -- final save
end)

game:BindToClose(function()
	PlotManager.DepositAllVaults()
	PlayerData.ReleaseAll(25)
end)

PlayerData.StartAutosave()
PlotManager.Start()
GameDay.Start()

print(("[%s] Ready with %d stadium plots."):format(Config.GameTitle, Config.PlotCount))
