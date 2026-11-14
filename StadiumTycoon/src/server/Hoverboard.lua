--[[
	Hoverboard
	Every franchise owner gets a "Hoverboard" Tool as soon as they claim a plot: one in their
	Backpack (the hotbar) and one in their StarterGear, which puts it back in the hotbar after a
	respawn. Both go away when the plot is released. Pick it in the hotbar to ride, put it away
	(or pick something else) to walk.

	Riding is set up here, on the server:
	  * the board is built under the rider's feet in the team colours: deck, rails, a stripe, a
	    small underglow and a soft trail. Its parts sit in the Tool itself, never in a nested
	    Model (touch pads find the player through the character Model). They don't collide and
	    weigh nothing. An invisible "TouchSkid" reaches down past the floor, so buy buttons,
	    collect pads, bus stops, kick spots and the gold gates still work while hovering.
	  * the rider floats Config.Hoverboard.HoverHeight higher (HipHeight) and walks at
	    Config.Hoverboard.Speed. The normal jump is off (JumpPower and JumpHeight 0): the
	    rider's client does a charged jump instead (Hoverboard.client.lua).
	  * putting the board away, sitting down (seats, golf carts, TV camera seats), dying,
	    respawning, leaving or losing the tool ends the ride: WalkSpeed, the jump and HipHeight
	    go back exactly as they were. A smoothie / sports drink boost that is still running comes
	    back (Snacks.BoostSpeed); while riding, snacks leave WalkSpeed alone.

	Attributes: Hoverboard = true on the board Tool, and on the rider's Humanoid while riding.
	The client bobs the board around the "BaseC0" attribute of its BoardWeld.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))

local Snacks = require(script.Parent.Snacks)

local Hoverboard = {}

local TOOL_NAME = "Hoverboard"
local MARK = "Hoverboard" -- attribute: marks the board Tool, and the rider's Humanoid while riding
local SWEEP_SECONDS = 0.5 -- every player's board is checked this often (events check at once)
local RESPAWN_GRACE = 1 -- after a respawn the StarterGear copy should be in the hotbar by then
local DECK_THICKNESS = 0.3
local DECK_SIZE = Vector3.new(2.4, DECK_THICKNESS, 3.6) -- the middle of the deck (round nose + tail)
local TIP = "You got a HOVERBOARD! Pick it in your hotbar to ride 3x faster. Hold jump to charge a giant jump!"

-- The board's parts besides the deck, relative to the deck's centre (-Z is the front). Role =
-- the team colour that paints it (see paint).
local BOARD_PARTS = {
	{
		Name = "BoardNose",
		Size = Vector3.new(DECK_THICKNESS, 2.4, 2.4),
		Offset = CFrame.new(0, 0, -1.8) * CFrame.Angles(0, 0, math.rad(90)),
		Cylinder = true,
		Role = "Deck",
	},
	{
		Name = "BoardTail",
		Size = Vector3.new(DECK_THICKNESS, 2.4, 2.4),
		Offset = CFrame.new(0, 0, 1.8) * CFrame.Angles(0, 0, math.rad(90)),
		Cylinder = true,
		Role = "Deck",
	},
	{ Name = "BoardStripe", Size = Vector3.new(0.5, 0.06, 5.2), Offset = CFrame.new(0, 0.16, 0), Role = "Stripe" },
	{
		Name = "BoardRailLeft",
		Size = Vector3.new(0.16, 0.38, 3.6),
		Offset = CFrame.new(-1.2, 0.02, 0),
		Material = Enum.Material.Metal,
		Role = "Rail",
	},
	{
		Name = "BoardRailRight",
		Size = Vector3.new(0.16, 0.38, 3.6),
		Offset = CFrame.new(1.2, 0.02, 0),
		Material = Enum.Material.Metal,
		Role = "Rail",
	},
	-- a small underglow (Neon, team colour) with a dim, short-range light
	{
		Name = "BoardGlow",
		Size = Vector3.new(1.4, 0.08, 4.4),
		Offset = CFrame.new(0, -0.2, 0),
		Material = Enum.Material.Neon,
		Transparency = 0.2,
		Role = "Glow",
	},
}
local GLOW_LIGHT = { Brightness = 0.8, Range = 6 }

local plotManager = nil
local notifyRemote = nil
local riders = {} -- [Player] = { character, humanoid, tool, parts = { [part] = role }, trail, palette, saved }
local watchedPlayers = {} -- [Player] = true
local watchedCharacters = setmetatable({}, { __mode = "k" }) -- [character Model] = true
local spawnedAt = {} -- [Player] = os.clock() of their last CharacterAdded
local scheduled = {} -- [Player] = true while a check is queued
local tipped = {} -- [Player] = true once they were told about their board

local function settings()
	return Config.Hoverboard
end

local function isBoard(inst)
	return inst:IsA("Tool") and inst:GetAttribute(MARK) == true
end

-- The board Tool the character holds (is riding), or nil.
local function equippedBoard(character)
	for _, child in ipairs(character:GetChildren()) do
		if isBoard(child) then
			return child
		end
	end
	return nil
end

local function makeTool()
	local tool = Instance.new("Tool")
	tool.Name = TOOL_NAME
	tool.ToolTip = "Ride 3x faster! Hold jump for a giant jump"
	tool.RequiresHandle = false -- (no Handle: nothing in your hand, the board goes under your feet)
	tool.CanBeDropped = false
	tool:SetAttribute(MARK, true)
	return tool
end

-- The team's main colour as a glow: same hue, a little brighter, never white.
local function glowColor(color)
	local h, s, v = color:ToHSV()
	if s < 0.3 then
		return Color3.fromHSV(h, s, math.min(v, 0.5)) -- (a grey or white team colour: a soft grey glow)
	end
	return Color3.fromHSV(h, s, math.max(v, 0.75))
end

-- How far below the root part's centre the rider's soles are when standing on foot.
local function soleDrop(character, humanoid, root)
	local legs = 0
	if humanoid.RigType == Enum.HumanoidRigType.R6 then
		local leg = character:FindFirstChild("Left Leg")
		legs = leg and leg:IsA("BasePart") and leg.Size.Y or 2 -- (R6: the legs hold the body up)
	end
	return root.Size.Y / 2 + humanoid.HipHeight + legs
end

local function newPart(name, size, cframe)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.CastShadow = false
	part.Material = Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	return part
end

local function weld(name, part0, part1, c0)
	local joint = Instance.new("Weld")
	joint.Name = name
	joint.Part0 = part0
	joint.Part1 = part1
	joint.C0 = c0
	joint.Parent = part1
	return joint
end

-- Builds the board in `tool` under the feet of the rider whose root part is `root` (soles `drop`
-- below its centre). Returns { [part] = role }, trail.
local function buildBoard(tool, root, drop)
	local parts = {}
	-- the deck's top is where the soles were on foot: the rider is lifted HoverHeight, so it hovers
	local deckOffset = CFrame.new(0, -(drop + DECK_THICKNESS / 2), 0)
	local deck = newPart("BoardDeck", DECK_SIZE, root.CFrame * deckOffset)
	local joint = weld("BoardWeld", root, deck, deckOffset)
	joint:SetAttribute("BaseC0", deckOffset) -- (the client bobs and tilts the board around this)
	parts[deck] = "Deck"
	for _, spec in ipairs(BOARD_PARTS) do
		local part = newPart(spec.Name, spec.Size, deck.CFrame * spec.Offset)
		if spec.Cylinder then
			part.Shape = Enum.PartType.Cylinder
		end
		part.Material = spec.Material or Enum.Material.SmoothPlastic
		part.Transparency = spec.Transparency or 0
		weld("Weld", deck, part, spec.Offset)
		parts[part] = spec.Role
		if spec.Role == "Glow" then
			local light = Instance.new("PointLight")
			light.Name = "Underglow"
			light.Brightness = GLOW_LIGHT.Brightness
			light.Range = GLOW_LIGHT.Range
			light.Shadows = false
			light.Parent = part
		end
	end

	-- the touch skid: from under the deck to a little below the floor (touch pads are flat)
	local height = math.max(0.3, settings().HoverHeight - DECK_THICKNESS + 0.3)
	local skidOffset = CFrame.new(0, -(DECK_THICKNESS / 2 + height / 2), 0)
	local skid = newPart("TouchSkid", Vector3.new(2.2, height, 4.8), deck.CFrame * skidOffset)
	skid.Transparency = 1
	skid.CanTouch = true
	weld("Weld", deck, skid, skidOffset)
	parts[skid] = "Skid"

	-- a soft trail behind the tail (it only shows while the board moves)
	local left = Instance.new("Attachment")
	left.Name = "TrailLeft"
	left.Position = Vector3.new(-0.85, -0.1, 2.6)
	left.Parent = deck
	local right = Instance.new("Attachment")
	right.Name = "TrailRight"
	right.Position = Vector3.new(0.85, -0.1, 2.6)
	right.Parent = deck
	local trail = Instance.new("Trail")
	trail.Name = "BoardTrail"
	trail.Attachment0 = left
	trail.Attachment1 = right
	trail.Lifetime = 0.35
	trail.MinLength = 0.2
	trail.FaceCamera = false
	trail.LightEmission = 0
	trail.Transparency = NumberSequence.new(0.55, 1)
	trail.WidthScale = NumberSequence.new(1, 0.4)
	trail.Parent = deck

	for part in pairs(parts) do
		part.Parent = tool
	end
	return parts, trail
end

-- Paints a mounted board in a team palette.
local function paint(ride, palette)
	ride.palette = palette
	local glow = glowColor(palette.Primary)
	for part, role in pairs(ride.parts) do
		if role == "Deck" then
			part.Color = palette.Primary
		elseif role == "Rail" then
			part.Color = palette.Secondary
		elseif role == "Stripe" then
			part.Color = palette.Trim or palette.Secondary
		elseif role == "Glow" then
			part.Color = glow
			for _, light in ipairs(part:GetChildren()) do
				if light:IsA("Light") then
					light.Color = glow
				end
			end
		end
	end
	if ride.trail then
		ride.trail.Color = ColorSequence.new(glow)
	end
end

local function mount(player, character, humanoid, root, tool, plot)
	local s = settings()
	local saved = {
		-- (a snack boost that is running now ends back at the normal walking speed)
		WalkSpeed = Snacks.BoostSpeed(humanoid) and Snacks.WalkSpeed or humanoid.WalkSpeed,
		JumpPower = humanoid.JumpPower,
		JumpHeight = humanoid.JumpHeight,
		HipHeight = humanoid.HipHeight,
	}
	for _, child in ipairs(tool:GetChildren()) do
		if child:IsA("BasePart") then
			child:Destroy() -- (left over from an earlier ride)
		end
	end
	local parts, trail = buildBoard(tool, root, soleDrop(character, humanoid, root))
	local ride = {
		character = character,
		humanoid = humanoid,
		tool = tool,
		parts = parts,
		trail = trail,
		palette = nil,
		saved = saved,
	}
	riders[player] = ride
	paint(ride, plot.Palette)
	humanoid:SetAttribute(MARK, true)
	humanoid.WalkSpeed = s.Speed
	humanoid.JumpPower = 0 -- (the normal jump does nothing: the client's charged jump takes over)
	humanoid.JumpHeight = 0
	humanoid.HipHeight = saved.HipHeight + s.HoverHeight
end

local function dismount(player)
	local ride = riders[player]
	riders[player] = nil
	if not ride then
		return
	end
	for part in pairs(ride.parts) do
		part:Destroy()
	end
	local humanoid, saved = ride.humanoid, ride.saved
	humanoid:SetAttribute(MARK, nil)
	humanoid.WalkSpeed = Snacks.BoostSpeed(humanoid) or saved.WalkSpeed
	humanoid.JumpPower = saved.JumpPower
	humanoid.JumpHeight = saved.JumpHeight
	humanoid.HipHeight = saved.HipHeight
	-- a board that was dropped (not put away, not destroyed) goes back into the hotbar
	local tool = ride.tool
	local parent = tool.Parent
	if parent and parent ~= ride.character and not parent:IsA("Backpack") then
		local backpack = player:FindFirstChildOfClass("Backpack")
		if backpack and player.Parent then
			tool.Parent = backpack
		else
			tool:Destroy()
		end
	end
end

-- Tells a player who just claimed a plot about their board (once; after the welcome messages).
local function sendTip(player)
	if tipped[player] or not notifyRemote or not settings().Enabled then
		return
	end
	tipped[player] = true
	task.delay(settings().TipDelaySeconds or 0, function()
		if player.Parent and plotManager.GetPlot(player) then
			notifyRemote:FireClient(player, TIP, "success")
		end
	end)
end

-- A plot owner has one board in the hotbar (or in hand) and one in StarterGear; nobody else has any.
local function ensureTools(player, owner, alive)
	local backpack = player:FindFirstChildOfClass("Backpack")
	local gear = player:FindFirstChild("StarterGear")
	local held, stored = {}, {}
	-- (the character first: the board in use is the one that stays)
	for _, container in ipairs({ player.Character or false, backpack or false }) do
		if container then
			for _, child in ipairs(container:GetChildren()) do
				if isBoard(child) then
					table.insert(held, child)
				end
			end
		end
	end
	for _, child in ipairs(gear and gear:GetChildren() or {}) do
		if isBoard(child) then
			table.insert(stored, child)
		end
	end
	if not owner then
		for _, tool in ipairs(held) do
			tool:Destroy()
		end
		for _, tool in ipairs(stored) do
			tool:Destroy()
		end
		return
	end
	for index = 2, #held do
		held[index]:Destroy()
	end
	for index = 2, #stored do
		stored[index]:Destroy()
	end
	if #stored == 0 and gear then
		makeTool().Parent = gear
	end
	-- (right after a respawn the StarterGear copy is on its way: don't add a second one)
	local respawning = #stored > 0 and os.clock() - (spawnedAt[player] or 0) < RESPAWN_GRACE
	if #held == 0 and backpack and alive and not respawning then
		makeTool().Parent = backpack
	end
end

-- Brings one player's board in line with how things are now: who owns a plot, what the
-- character holds, whether it is alive or sitting. Safe to call any time, as often as needed.
local function reconcile(player)
	local plot = plotManager and plotManager.GetPlot(player)
	local owner = plot ~= nil and player.Parent ~= nil and settings().Enabled == true
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local alive = humanoid ~= nil and humanoid.Health > 0 and character.Parent ~= nil
	local seated = humanoid ~= nil and humanoid.SeatPart ~= nil
	local tool = character and equippedBoard(character)

	local ride = riders[player]
	if ride and (ride.character ~= character or ride.tool ~= tool or not alive or seated or not owner) then
		dismount(player)
		ride = nil
	end
	if tool and alive and seated then
		-- sitting down (a seat, a golf cart, a TV camera seat) puts the board away
		local backpack = player:FindFirstChildOfClass("Backpack")
		if backpack then
			tool.Parent = backpack
		end
	elseif tool and alive and owner and root and not ride then
		mount(player, character, humanoid, root, tool, plot)
	elseif ride and ride.palette ~= plot.Palette then
		paint(ride, plot.Palette) -- (the team colours changed)
	end
	ensureTools(player, owner, alive)
end

local function check(player)
	local ok, err = pcall(reconcile, player)
	if not ok then
		warn("[Hoverboard] " .. tostring(err))
	end
end

-- Queues one check of the player's board (several events in a row make one check).
local function schedule(player)
	if scheduled[player] then
		return
	end
	scheduled[player] = true
	task.defer(function()
		scheduled[player] = nil
		check(player)
	end)
end

local function watchCharacter(player, character)
	if watchedCharacters[character] then
		return
	end
	watchedCharacters[character] = true
	local function changed()
		schedule(player)
	end
	-- (a Tool moving into the character = picked in the hotbar; moving out = put away / dropped)
	character.ChildAdded:Connect(changed)
	character.ChildRemoved:Connect(changed)
	task.spawn(function()
		local humanoid = character:FindFirstChildOfClass("Humanoid") or character:WaitForChild("Humanoid", 10)
		if humanoid then
			humanoid:GetPropertyChangedSignal("SeatPart"):Connect(changed)
			humanoid.Died:Connect(changed)
		end
	end)
end

local function watchPlayer(player)
	if watchedPlayers[player] then
		return
	end
	watchedPlayers[player] = true
	player.CharacterAdded:Connect(function(character)
		spawnedAt[player] = os.clock()
		watchCharacter(player, character)
		schedule(player)
		task.delay(RESPAWN_GRACE + 0.1, schedule, player)
	end)
	player:GetAttributeChangedSignal("PlotIndex"):Connect(function()
		schedule(player) -- (claimed a plot: the board goes into the hotbar at once)
		if player:GetAttribute("PlotIndex") then
			sendTip(player)
		end
	end)
	if player.Character then
		watchCharacter(player, player.Character)
	end
	schedule(player)
end

local function forget(player)
	dismount(player)
	watchedPlayers[player] = nil
	spawnedAt[player] = nil
	scheduled[player] = nil
	tipped[player] = nil
end

function Hoverboard.Init(manager, remote)
	plotManager = manager
	notifyRemote = remote
	Players.PlayerAdded:Connect(watchPlayer)
	Players.PlayerRemoving:Connect(forget)
	for _, player in ipairs(Players:GetPlayers()) do
		watchPlayer(player)
	end
	-- a released plot takes its owner's board away; new team colours repaint a board in use
	manager.OnPlotReleased(function()
		for _, player in ipairs(Players:GetPlayers()) do
			schedule(player)
		end
		for player in pairs(riders) do
			schedule(player)
		end
	end)
	manager.OnTeamApplied(function(plot)
		if plot.Owner then
			schedule(plot.Owner)
		end
	end)
	-- the safety net: every player's board is checked every SWEEP_SECONDS
	task.spawn(function()
		while true do
			task.wait(SWEEP_SECONDS)
			for _, player in ipairs(Players:GetPlayers()) do
				check(player)
			end
			for player in pairs(riders) do
				if player.Parent == nil then
					forget(player) -- (left the game)
				end
			end
		end
	end)
end

-- True while the player rides their hoverboard.
function Hoverboard.IsRiding(player)
	return riders[player] ~= nil
end

-- (tests)
Hoverboard._reconcile = reconcile
Hoverboard._glowColor = glowColor

return Hoverboard
