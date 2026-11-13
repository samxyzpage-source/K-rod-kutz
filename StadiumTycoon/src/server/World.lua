--[[
	World
	Lays out the plots along a central street, builds the street + spawn decorations,
	and runs the day/night cycle.
]]

local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local World = {}

-- Plot origins: plots sit in two rows facing a central street that runs along X.
-- Odd plots are on the +Z side, even plots on the -Z side; every plot's front (-Z local) faces the street.
function World.GetPlotOrigins(config)
	local L = config.Layout
	local count = math.clamp(math.floor(config.PlotCount), 1, 6)
	local perSide = math.ceil(count / 2)
	local spacing = L.PlotWidth + L.PlotGap
	-- the plot origin sits -PlotFrontZ studs behind the plot's front edge (the plot can be
	-- deeper at the back than at the front)
	local zOffset = L.StreetWidth / 2 - L.PlotFrontZ
	local origins = {}
	for index = 1, count do
		local onSouthSide = (index % 2 == 0)
		local column = math.floor((index - 1) / 2)
		local x = (column - (perSide - 1) / 2) * spacing
		local origin
		if onSouthSide then
			origin = CFrame.new(x, 1, -zOffset) * CFrame.Angles(0, math.pi, 0)
		else
			origin = CFrame.new(x, 1, zOffset)
		end
		origins[index] = origin
	end
	return origins
end

local function makePart(props)
	local part = Instance.new("Part")
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in pairs(props) do
		if key ~= "Parent" then
			part[key] = value
		end
	end
	part.Parent = props.Parent
	return part
end

local function addSurfaceText(part, face, text, textColor, backgroundColor)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 25
	gui.LightInfluence = 0
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundColor3 = backgroundColor
	label.BackgroundTransparency = 0
	label.BorderSizePixel = 0
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextColor3 = textColor
	label.Text = text
	label.Parent = gui
	gui.Parent = part
end

-- Ground, street, spawn and the welcome sign.
function World.Build(config)
	local L = config.Layout
	local count = math.clamp(math.floor(config.PlotCount), 1, 6)
	local perSide = math.ceil(count / 2)
	local streetLength = perSide * (L.PlotWidth + L.PlotGap) + 200

	local folder = Instance.new("Folder")
	folder.Name = "World"

	if not Workspace:FindFirstChild("Ground") then
		local groundWidth = math.min(2048, streetLength + 400)
		makePart({
			Name = "Ground",
			Size = Vector3.new(groundWidth, 4, math.min(2048, L.StreetWidth + (L.PlotBackZ - L.PlotFrontZ) * 2 + 400)),
			CFrame = CFrame.new(0, -2, 0),
			Color = Color3.fromRGB(76, 140, 66),
			Material = Enum.Material.Grass,
			Parent = Workspace,
		})
	end

	if not Workspace:FindFirstChildOfClass("SpawnLocation") then
		local spawn = Instance.new("SpawnLocation")
		spawn.Name = "SpawnLocation"
		spawn.Anchored = true
		spawn.Size = Vector3.new(12, 1, 12)
		spawn.CFrame = CFrame.new(0, 0.5, 0)
		spawn.Neutral = true
		spawn.Duration = 0
		spawn.Parent = Workspace
	end

	makePart({
		Name = "Street",
		Size = Vector3.new(streetLength, 0.2, L.StreetWidth),
		CFrame = CFrame.new(0, 0.1, 0),
		Color = config.Colors.Asphalt,
		Material = Enum.Material.Asphalt,
		Parent = folder,
	})

	-- dashed centre line (with a gap around the spawn pad)
	local dash = 10
	local x = -streetLength / 2 + dash
	while x < streetLength / 2 - dash do
		if math.abs(x) > 12 then
			makePart({
				Name = "StreetDash",
				Size = Vector3.new(dash, 0.05, 0.8),
				CFrame = CFrame.new(x, 0.225, 0),
				Color = Color3.fromRGB(255, 214, 10),
				Material = Enum.Material.SmoothPlastic,
				CanCollide = false,
				Parent = folder,
			})
		end
		x += dash * 2
	end

	-- welcome arch over the spawn
	local gold = config.Colors.Gold
	for _, side in ipairs({ -1, 1 }) do
		makePart({
			Name = "WelcomePost",
			Size = Vector3.new(2, 20, 2),
			CFrame = CFrame.new(side * 18, 10, 0),
			Color = Color3.fromRGB(40, 40, 46),
			Material = Enum.Material.Metal,
			Parent = folder,
		})
	end
	local sign = makePart({
		Name = "WelcomeSign",
		Size = Vector3.new(40, 6, 1),
		CFrame = CFrame.new(0, 22, 0),
		Color = Color3.fromRGB(20, 20, 26),
		Material = Enum.Material.SmoothPlastic,
		Parent = folder,
	})
	local title = string.upper(config.GameTitle)
	addSurfaceText(sign, Enum.NormalId.Front, title, gold, Color3.fromRGB(20, 20, 26))
	addSurfaceText(sign, Enum.NormalId.Back, title, gold, Color3.fromRGB(20, 20, 26))

	folder.Parent = Workspace
	return folder
end

function World.IsNight(config, clockTime)
	return clockTime >= config.NightStartsAt or clockTime < config.NightEndsAt
end

-- Advances Lighting.ClockTime and calls onNightChanged(isNight) whenever night starts or ends.
function World.StartDayNight(config, onNightChanged)
	local wasNight = World.IsNight(config, Lighting.ClockTime)
	onNightChanged(wasNight)
	if not config.DayNightCycle then
		return
	end
	local hoursPerSecond = 24 / math.max(config.DayLengthSeconds, 10)
	task.spawn(function()
		local last = os.clock()
		while true do
			task.wait(0.5)
			local now = os.clock()
			Lighting.ClockTime = (Lighting.ClockTime + (now - last) * hoursPerSecond) % 24
			last = now
			local isNight = World.IsNight(config, Lighting.ClockTime)
			if isNight ~= wasNight then
				wasNight = isNight
				onNightChanged(isNight)
			end
		end
	end)
end

return World
