--[[
	Snacks
	Items players can grab around the franchise (cafeteria trays, smoothies, hot dogs from the
	food vendors, foam fingers from the team store...). Each one is a Tool built from parts
	here, so it needs no uploaded models. Click (or tap) while holding it to eat / drink / cheer.

	  Smoothie, SportsDrink  a short speed boost
	  HotDog, Popcorn, Soda, LunchTray  a little health + a "Yum!"
	  FoamFinger  cheer: "WE'RE #1!" above your head (never runs out)
]]

local Players = game:GetService("Players")

local Snacks = {}

local DEFAULT_WALK_SPEED = 16
local MAX_ITEMS = 4 -- snacks a player can carry at once

local WHITE = Color3.fromRGB(245, 245, 240)
local SNACKS = {
	HotDog = {
		Name = "Hot Dog",
		Bites = 3,
		Tip = "Click to take a bite",
		Handle = { Size = Vector3.new(0.7, 0.5, 2.2), Color = Color3.fromRGB(222, 180, 110), Material = Enum.Material.SmoothPlastic },
		Extras = {
			{
				Size = Vector3.new(0.45, 0.45, 2.5),
				Offset = CFrame.new(0, 0.25, 0),
				Color = Color3.fromRGB(170, 70, 50),
				Shape = "Cylinder",
			},
			{ Size = Vector3.new(0.12, 0.08, 2), Offset = CFrame.new(0, 0.5, 0), Color = Color3.fromRGB(240, 200, 40) },
		},
	},
	Popcorn = {
		Name = "Popcorn",
		Bites = 4,
		Tip = "Click to munch",
		Handle = { Size = Vector3.new(1, 1.4, 1), Color = Color3.fromRGB(220, 40, 40), Material = Enum.Material.SmoothPlastic },
		Extras = {
			{
				Size = Vector3.new(1.1, 0.5, 1.1),
				Offset = CFrame.new(0, 0.9, 0),
				Color = Color3.fromRGB(255, 240, 190),
				Material = Enum.Material.Pebble,
			},
			{ Size = Vector3.new(1.02, 0.25, 1.02), Offset = CFrame.new(0, 0.2, 0), Color = WHITE },
		},
	},
	Soda = {
		Name = "Soda",
		Bites = 3,
		Tip = "Click to sip",
		Handle = { Size = Vector3.new(0.8, 1.5, 0.8), Color = Color3.fromRGB(30, 110, 200), Material = Enum.Material.SmoothPlastic },
		Extras = {
			{ Size = Vector3.new(0.85, 0.15, 0.85), Offset = CFrame.new(0, 0.82, 0), Color = WHITE },
			{ Size = Vector3.new(0.12, 0.9, 0.12), Offset = CFrame.new(0.15, 1.2, 0), Color = Color3.fromRGB(255, 80, 80) },
		},
	},
	SportsDrink = {
		Name = "Sports Drink",
		Bites = 3,
		Tip = "Click to drink - speed boost!",
		Boost = { Speed = 24, Seconds = 15 },
		Handle = {
			Size = Vector3.new(0.7, 1.6, 0.7),
			Color = Color3.fromRGB(255, 140, 20),
			Material = Enum.Material.Glass,
			Transparency = 0.2,
		},
		Extras = {
			{ Size = Vector3.new(0.5, 0.35, 0.5), Offset = CFrame.new(0, 0.95, 0), Color = Color3.fromRGB(40, 160, 60) },
			{ Size = Vector3.new(0.72, 0.5, 0.72), Offset = CFrame.new(0, 0, 0), Color = WHITE },
		},
	},
	Smoothie = {
		Name = "Smoothie",
		Bites = 3,
		Tip = "Click to sip - speed boost!",
		Boost = { Speed = 22, Seconds = 20 },
		Handle = {
			Size = Vector3.new(0.8, 1.5, 0.8),
			Color = Color3.fromRGB(230, 90, 150),
			Material = Enum.Material.Glass,
			Transparency = 0.15,
		},
		Extras = {
			{ Size = Vector3.new(0.85, 0.2, 0.85), Offset = CFrame.new(0, 0.85, 0), Color = WHITE },
			{
				Size = Vector3.new(0.12, 1, 0.12),
				Offset = CFrame.new(0.2, 1.3, 0) * CFrame.Angles(0, 0, math.rad(12)),
				Color = Color3.fromRGB(80, 200, 120),
			},
		},
	},
	LunchTray = {
		Name = "Lunch Tray",
		Bites = 4,
		Tip = "Click to eat",
		Team = true,
		Handle = { Size = Vector3.new(2.4, 0.2, 1.6), Color = Color3.fromRGB(60, 60, 66), Material = Enum.Material.SmoothPlastic },
		Extras = {
			{
				Size = Vector3.new(0.9, 0.35, 0.9),
				Offset = CFrame.new(-0.5, 0.25, 0),
				Color = Color3.fromRGB(120, 70, 40),
				Shape = "Cylinder",
			},
			{ Size = Vector3.new(0.7, 0.35, 0.6), Offset = CFrame.new(0.55, 0.25, -0.3), Color = Color3.fromRGB(90, 190, 80) },
			{
				Size = Vector3.new(0.35, 0.8, 0.35),
				Offset = CFrame.new(0.7, 0.5, 0.45),
				Color = Color3.fromRGB(255, 255, 255),
				Material = Enum.Material.Glass,
			},
		},
	},
	FoamFinger = {
		Name = "Foam Finger",
		Bites = 0, -- never runs out
		Tip = "Click to cheer!",
		Team = true,
		Handle = { Size = Vector3.new(0.6, 1.4, 0.6), Color = Color3.fromRGB(255, 196, 37), Material = Enum.Material.Fabric },
		Extras = {
			{ Size = Vector3.new(1.6, 1.4, 0.5), Offset = CFrame.new(0, 1.3, 0), Material = Enum.Material.Fabric, TeamColor = true },
			{ Size = Vector3.new(0.45, 1.6, 0.45), Offset = CFrame.new(0.3, 2.7, 0), Material = Enum.Material.Fabric, TeamColor = true },
		},
	},
}
Snacks.Kinds = SNACKS

local function makePart(name, spec, color)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = spec.Size
	part.Color = color or spec.Color or WHITE
	part.Material = spec.Material or Enum.Material.SmoothPlastic
	if spec.Transparency then
		part.Transparency = spec.Transparency
	end
	if spec.Shape == "Cylinder" then
		part.Shape = Enum.PartType.Cylinder
	end
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.Anchored = false
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	return part
end

-- Builds the Tool for `kind` (a key of SNACKS). palette = team colours for team items.
function Snacks.Build(kind, palette)
	local spec = SNACKS[kind]
	if not spec then
		return nil
	end
	local tool = Instance.new("Tool")
	tool.Name = spec.Name
	tool.ToolTip = spec.Tip
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool:SetAttribute("Snack", kind)
	tool:SetAttribute("Bites", spec.Bites)
	local handle = makePart("Handle", spec.Handle)
	handle.CFrame = CFrame.new()
	handle.Parent = tool
	for index, extra in ipairs(spec.Extras or {}) do
		local color = extra.TeamColor and palette and palette.Primary or nil
		local part = makePart("Piece" .. index, extra, color)
		part.CFrame = handle.CFrame * extra.Offset
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = handle
		weld.Part1 = part
		weld.Parent = part
		part.Parent = tool
	end
	if spec.Team and palette and kind == "FoamFinger" then
		handle.Color = palette.Secondary
	end
	return tool
end

local function heldTools(player)
	local list = {}
	local backpack = player:FindFirstChildOfClass("Backpack")
	for _, container in ipairs({ backpack, player.Character }) do
		if container then
			for _, child in ipairs(container:GetChildren()) do
				if child:IsA("Tool") and child:GetAttribute("Snack") then
					table.insert(list, child)
				end
			end
		end
	end
	return list
end

local function speedBoost(humanoid, boost)
	local untilTime = os.clock() + boost.Seconds
	humanoid:SetAttribute("BoostUntil", untilTime)
	humanoid.WalkSpeed = boost.Speed
	task.delay(boost.Seconds, function()
		if humanoid.Parent and (humanoid:GetAttribute("BoostUntil") or 0) <= os.clock() + 0.05 then
			humanoid.WalkSpeed = DEFAULT_WALK_SPEED
			humanoid:SetAttribute("BoostUntil", nil)
		end
	end)
end

local function cheer(character)
	local head = character:FindFirstChild("Head")
	if not head or head:FindFirstChild("Cheer") then
		return
	end
	local gui = Instance.new("BillboardGui")
	gui.Name = "Cheer"
	gui.Size = UDim2.new(8, 0, 2, 0)
	gui.StudsOffset = Vector3.new(0, 3, 0)
	gui.AlwaysOnTop = true
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(255, 220, 60)
	label.TextStrokeTransparency = 0.2
	label.Text = "WE'RE #1!"
	label.Parent = gui
	gui.Parent = head
	task.delay(2, function()
		gui:Destroy()
	end)
end

-- What happens when the player clicks while holding the item.
function Snacks.Use(tool, player)
	local kind = tool:GetAttribute("Snack")
	local spec = SNACKS[kind]
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not spec or not humanoid or humanoid.Health <= 0 then
		return nil
	end
	local now = os.clock()
	if now - (tool:GetAttribute("LastUse") or 0) < 0.6 then
		return nil
	end
	tool:SetAttribute("LastUse", now)
	if kind == "FoamFinger" then
		cheer(character)
		return "cheer"
	end
	local bites = (tool:GetAttribute("Bites") or 1) - 1
	tool:SetAttribute("Bites", bites)
	humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + 10)
	if spec.Boost then
		speedBoost(humanoid, spec.Boost)
	end
	if bites <= 0 then
		tool:Destroy()
		return "finished"
	end
	return "bite"
end

--[[
	Gives `player` a snack. Returns true, message or false, message (for a notification).
]]
function Snacks.Give(player, kind, palette)
	local spec = SNACKS[kind]
	if not spec then
		return false, "That's not on the menu."
	end
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then
		return false, "Can't carry that right now."
	end
	local held = heldTools(player)
	for _, tool in ipairs(held) do
		if tool:GetAttribute("Snack") == kind then
			return false, ("You already have a %s! Click to use it."):format(spec.Name)
		end
	end
	if #held >= MAX_ITEMS then
		return false, "Your hands are full! Finish a snack first."
	end
	local tool = Snacks.Build(kind, palette)
	tool.Activated:Connect(function()
		local owner = Players:GetPlayerFromCharacter(tool.Parent)
		if owner then
			Snacks.Use(tool, owner)
		end
	end)
	tool.Parent = backpack
	return true, ("%s! %s."):format(spec.Name, spec.Tip)
end

return Snacks
