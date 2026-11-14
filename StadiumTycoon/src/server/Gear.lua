--[[
	Gear
	The coaching gear and the wardrobe of the Coaches' Locker Room (Builders/StadiumRooms.lua,
	piece coach_lockerroom). Interactions.lua calls Give / Wear / ChangeBack from the room's "use"
	prompts (Interact.Uses: whistle, clipboard, coachpolo, hoodie, jersey, changeback) once it has
	checked the request (a real prompt on a plot, the player next to it, not too often).

	TOOLS are built from parts here, like Snacks.lua (no uploaded models). Click or tap while
	holding one (gamepad: the trigger):
	  Whistle    blow it: a "TWEEEET!" bubble over your head that everyone sees, and a short
	             high "tweet" (a sound that ships with every Roblox client)
	  Clipboard  draw up a play: the play's name pops up over your head
	OUTFITS: we can't use catalog clothing, so an outfit is drawn with body colours in the team
	colours plus small welded parts (non-collidable, massless). Your Shirt, Pants, T-shirt and body
	colours are put away while you wear it (layered clothing - and hats, under a cap or a hood -
	are hidden), and "Change back" puts all of it back exactly as it was:
	  CoachPolo       Head Coach Polo: team polo, khakis, a cap, a headset and a whistle on a lanyard
	  SidelineHoodie  team hoodie with a hood and a pocket, dark track pants, a headset
	  TeamJersey      team jersey with your name and number on the back, team-colour pants
	A respawn starts in your own clothes (the new character is built from your avatar). When the
	owner of the wardrobe's plot changes the team colours, a worn outfit is recoloured.
]]

local Players = game:GetService("Players")

local Gear = {}

local MAX_GEAR = 2 -- coaching tools a player can carry at once (one of each)
Gear.BubbleSeconds = 1.6 -- how long a TWEEEET! / play bubble shows over the head
local BUBBLE_DISTANCE = 90 -- other players see the bubble from this close
-- The whistle's tweet: Config.Sounds plays this built-in sound too. Set Id = "" for a silent whistle.
local WHISTLE_SOUND = { Id = "rbxasset://sounds/electronicpingshort.wav", Volume = 0.5, Speed = 2.4 }

local OUTFIT_FOLDER = "CoachOutfit" -- the outfit's own parts, in the character
local OUTFIT_COLORS = "CoachOutfitColors" -- the outfit's BodyColors, in the character

local WHITE = Color3.fromRGB(245, 245, 240)
local INK = Color3.fromRGB(22, 22, 26)
local CHROME = Color3.fromRGB(200, 204, 210)
local BOARD = Color3.fromRGB(150, 110, 70)
local MARKER_BLUE = Color3.fromRGB(30, 60, 160)
local MARKER_RED = Color3.fromRGB(190, 30, 40)
local KHAKI = Color3.fromRGB(172, 154, 120)
local TRACK_PANTS = Color3.fromRGB(44, 46, 54)
local HEADSET = Color3.fromRGB(34, 36, 42)

---------------------------------------------------------------------------------------------
-- Tools
---------------------------------------------------------------------------------------------

-- Part specs as in Snacks.lua; TeamColor = the palette key a part takes ("Primary"...).
local TOOLS = {
	Whistle = {
		Name = "Whistle",
		Tip = "Click to blow it!",
		Cooldown = 1.2,
		Handle = { Size = Vector3.new(0.4, 0.4, 0.7), Color = CHROME, Material = Enum.Material.Metal },
		Extras = {
			{ Size = Vector3.new(0.24, 0.2, 0.4), Offset = CFrame.new(0, 0.06, -0.5), Color = CHROME, Material = Enum.Material.Metal },
			{ Size = Vector3.new(0.42, 0.42, 0.12), Offset = CFrame.new(0, 0, 0.36), Color = INK }, -- the ring end
			{
				Size = Vector3.new(0.1, 1.3, 0.1),
				Offset = CFrame.new(0, -0.8, 0.3),
				Color = WHITE,
				Material = Enum.Material.Fabric,
				TeamColor = "Secondary",
			}, -- the lanyard
		},
	},
	Clipboard = {
		Name = "Clipboard",
		Tip = "Click to draw up a play!",
		Cooldown = 1.5,
		Handle = { Size = Vector3.new(1.2, 1.6, 0.1), Color = BOARD, Material = Enum.Material.Wood },
		Extras = {
			{ Size = Vector3.new(1, 1.25, 0.02), Offset = CFrame.new(0, -0.1, -0.06), Color = WHITE, Sheet = true },
			{
				Size = Vector3.new(0.6, 0.18, 0.16),
				Offset = CFrame.new(0, 0.72, -0.05),
				Color = CHROME,
				Material = Enum.Material.Metal,
				TeamColor = "Primary",
			}, -- the clip
		},
	},
}
Gear.Kinds = TOOLS

-- Plays the clipboard draws up, one after the other.
local PLAYS = {
	"HAIL MARY!",
	"FLEA FLICKER!",
	"QB SNEAK!",
	"SCREEN PASS!",
	"DOUBLE REVERSE!",
	"FAKE PUNT!",
	"BLITZ!",
	"STATUE OF LIBERTY!",
}
Gear.Plays = PLAYS

local function makePart(name, spec, color)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = spec.Size
	part.Color = color or spec.Color or WHITE
	part.Material = spec.Material or Enum.Material.SmoothPlastic
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.Anchored = false
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	return part
end

-- The X's and O's on the clipboard's play sheet.
local function drawPlay(sheet)
	local gui = Instance.new("SurfaceGui")
	gui.Name = "PlayGui"
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 60
	gui.Parent = sheet
	for index, line in ipairs({
		{ "PLAY 23", MARKER_RED, 0.04, 0.18 },
		{ "X     X     X", MARKER_BLUE, 0.3, 0.2 },
		{ "O O O O O", MARKER_RED, 0.55, 0.2 },
		{ "->       <-", MARKER_BLUE, 0.78, 0.16 },
	}) do
		local label = Instance.new("TextLabel")
		label.Name = "Line" .. index
		label.BackgroundTransparency = 1
		label.Position = UDim2.new(0.08, 0, line[3], 0)
		label.Size = UDim2.new(0.84, 0, line[4], 0)
		label.Font = Enum.Font.GothamBold
		label.Text = line[1]
		label.TextColor3 = line[2]
		label.TextScaled = true
		label.Parent = gui
	end
end

-- Builds the Tool for `kind` (a key of TOOLS). palette = the team colours of the gear room's plot.
function Gear.Build(kind, palette)
	local spec = TOOLS[kind]
	if not spec then
		return nil
	end
	local tool = Instance.new("Tool")
	tool.Name = spec.Name
	tool.ToolTip = spec.Tip
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool:SetAttribute("Gear", kind)
	local handle = makePart("Handle", spec.Handle)
	handle.CFrame = CFrame.new()
	handle.Parent = tool
	for index, extra in ipairs(spec.Extras) do
		local color = extra.TeamColor and palette and palette[extra.TeamColor] or nil
		local part = makePart("Piece" .. index, extra, color)
		part.CFrame = handle.CFrame * extra.Offset
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = handle
		weld.Part1 = part
		weld.Parent = part
		part.Parent = tool
		if extra.Sheet then
			drawPlay(part)
		end
	end
	if kind == "Whistle" and WHISTLE_SOUND.Id ~= "" then
		local sound = Instance.new("Sound")
		sound.Name = "Tweet"
		sound.SoundId = WHISTLE_SOUND.Id
		sound.Volume = WHISTLE_SOUND.Volume
		sound.PlaybackSpeed = WHISTLE_SOUND.Speed
		sound.RollOffMaxDistance = 100
		sound.Parent = handle
	end
	return tool
end

local function heldGear(player)
	local list = {}
	local backpack = player:FindFirstChildOfClass("Backpack")
	for _, container in ipairs({ backpack, player.Character }) do
		if container then
			for _, child in ipairs(container:GetChildren()) do
				if child:IsA("Tool") and child:GetAttribute("Gear") then
					table.insert(list, child)
				end
			end
		end
	end
	return list
end

-- A speech bubble over the character's head that every player sees for a moment (a new one
-- replaces the last one of the same name).
local function bubble(character, name, text)
	local head = character:FindFirstChild("Head")
	if not head then
		return nil
	end
	local old = head:FindFirstChild(name)
	if old then
		old:Destroy()
	end
	local gui = Instance.new("BillboardGui")
	gui.Name = name
	gui.Size = UDim2.new(7, 0, 1.8, 0)
	gui.StudsOffset = Vector3.new(0, 3.2, 0)
	gui.AlwaysOnTop = true
	gui.MaxDistance = BUBBLE_DISTANCE
	gui.LightInfluence = 0
	local panel = Instance.new("Frame")
	panel.Name = "Bubble"
	panel.Size = UDim2.new(1, 0, 1, 0)
	panel.BackgroundColor3 = WHITE
	panel.BorderSizePixel = 0
	panel.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.4, 0)
	corner.Parent = panel
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.BackgroundTransparency = 1
	label.Position = UDim2.new(0.06, 0, 0.1, 0)
	label.Size = UDim2.new(0.88, 0, 0.8, 0)
	label.Font = Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = INK
	label.TextScaled = true
	label.Parent = panel
	gui.Parent = head
	task.delay(Gear.BubbleSeconds, function()
		if gui.Parent then
			gui:Destroy()
		end
	end)
	return gui
end

-- What happens when the player clicks while holding the gear. Returns "tweet", the play's name,
-- or nil (not now).
function Gear.Use(tool, player)
	local kind = tool:GetAttribute("Gear")
	local spec = TOOLS[kind]
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not spec or not humanoid or humanoid.Health <= 0 or tool.Parent ~= character then
		return nil
	end
	local now = os.clock()
	if now - (tool:GetAttribute("LastUse") or 0) < spec.Cooldown then
		return nil
	end
	tool:SetAttribute("LastUse", now)
	if kind == "Whistle" then
		bubble(character, "WhistleBubble", "TWEEEET!")
		local handle = tool:FindFirstChild("Handle")
		local sound = handle and handle:FindFirstChild("Tweet")
		if sound then
			sound:Play()
		end
		return "tweet"
	end
	local index = (tool:GetAttribute("Play") or 0) % #PLAYS + 1
	tool:SetAttribute("Play", index)
	bubble(character, "PlayBubble", PLAYS[index])
	return PLAYS[index]
end

--[[
	Gives `player` a piece of gear (a key of TOOLS) in `palette`'s team colours.
	Returns true, message or false, message (for a notification).
]]
function Gear.Give(player, kind, palette)
	local spec = TOOLS[kind]
	if not spec then
		return false, "That's not in the gear room."
	end
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then
		return false, "Can't carry that right now."
	end
	local held = heldGear(player)
	for _, tool in ipairs(held) do
		if tool:GetAttribute("Gear") == kind then
			return false, ("You already have a %s! %s"):format(spec.Name, spec.Tip)
		end
	end
	if #held >= MAX_GEAR then
		return false, "Your hands are full of gear!"
	end
	local tool = Gear.Build(kind, palette)
	tool.Activated:Connect(function()
		local owner = Players:GetPlayerFromCharacter(tool.Parent)
		if owner then
			Gear.Use(tool, owner)
		end
	end)
	tool.Parent = backpack
	return true, ("%s! %s"):format(spec.Name, spec.Tip)
end

---------------------------------------------------------------------------------------------
-- Outfits
---------------------------------------------------------------------------------------------

--[[
	Torso / Arms / Legs: a palette key ("Primary"...) or a Color3; nil keeps that body colour
	(the polo's short sleeves show your arms). Cap, Headset, Lanyard, Hood, Jersey: the parts.
]]
local OUTFITS = {
	CoachPolo = { Name = "Head Coach Polo", Torso = "Primary", Legs = KHAKI, Cap = true, Headset = true, Lanyard = true },
	SidelineHoodie = { Name = "Sideline Hoodie", Torso = "Primary", Arms = "Primary", Legs = TRACK_PANTS, Hood = true, Headset = true },
	TeamJersey = { Name = "Team Jersey", Torso = "Primary", Arms = "Primary", Legs = "Secondary", Jersey = true },
}
Gear.Outfits = OUTFITS

local COLOR_FIELDS = { "HeadColor3", "TorsoColor3", "LeftArmColor3", "RightArmColor3", "LeftLegColor3", "RightLegColor3" }
-- the BodyColors field that colours each body part (R6 and R15)
local BODY_FIELD = {
	Head = "HeadColor3",
	Torso = "TorsoColor3",
	UpperTorso = "TorsoColor3",
	LowerTorso = "TorsoColor3",
	["Left Arm"] = "LeftArmColor3",
	LeftUpperArm = "LeftArmColor3",
	LeftLowerArm = "LeftArmColor3",
	LeftHand = "LeftArmColor3",
	["Right Arm"] = "RightArmColor3",
	RightUpperArm = "RightArmColor3",
	RightLowerArm = "RightArmColor3",
	RightHand = "RightArmColor3",
	["Left Leg"] = "LeftLegColor3",
	LeftUpperLeg = "LeftLegColor3",
	LeftLowerLeg = "LeftLegColor3",
	LeftFoot = "LeftLegColor3",
	["Right Leg"] = "RightLegColor3",
	RightUpperLeg = "RightLegColor3",
	RightLowerLeg = "RightLegColor3",
	RightFoot = "RightLegColor3",
}
-- (when a character has no BodyColors, its colours are read from these parts)
local FIELD_PART = {
	HeadColor3 = { "Head" },
	TorsoColor3 = { "UpperTorso", "Torso" },
	LeftArmColor3 = { "LeftUpperArm", "Left Arm" },
	RightArmColor3 = { "RightUpperArm", "Right Arm" },
	LeftLegColor3 = { "LeftUpperLeg", "Left Leg" },
	RightLegColor3 = { "RightUpperLeg", "Right Leg" },
}

--[[
	[player] = what that player's character wears: { player, character, outfit, palette, plot,
	owner, clothes = { Shirt / Pants / ShirtGraphic put away }, bodyColors (put away), base
	(the original body colours by field), partColors = { [part] = Color3 }, colors (the outfit's
	BodyColors), hidden = { [accessory handle] = Transparency }, folder (the outfit's parts) }
]]
local worn = {}

-- The player's outfit state, if their CURRENT character wears one (a respawned character came
-- in the player's own clothes, so an old state is dropped).
local function current(player)
	local state = worn[player]
	if state and (state.character ~= player.Character or state.character.Parent == nil) then
		worn[player] = nil
		return nil
	end
	return state
end

local function aliveCharacter(player)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not character or not character.Parent or not humanoid or humanoid.Health <= 0 then
		return nil
	end
	return character
end

-- Relative luminance / contrast (WCAG): the jersey's lettering stays readable in every palette.
local function luminance(color)
	local function channel(v)
		return v <= 0.03928 and v / 12.92 or ((v + 0.055) / 1.055) ^ 2.4
	end
	return 0.2126 * channel(color.R) + 0.7152 * channel(color.G) + 0.0722 * channel(color.B)
end

local function readableOn(background, candidates)
	local best, bestContrast = WHITE, 0
	for _, color in ipairs(candidates) do
		local a, b = luminance(color), luminance(background)
		local contrast = (math.max(a, b) + 0.05) / (math.min(a, b) + 0.05)
		if contrast >= 3 then
			return color
		end
		if contrast > bestContrast then
			best, bestContrast = color, contrast
		end
	end
	return best
end

local function shade(color, factor)
	return Color3.new(math.clamp(color.R * factor, 0, 1), math.clamp(color.G * factor, 0, 1), math.clamp(color.B * factor, 0, 1))
end

-- A palette key or a Color3 (nil stays nil: keep that body colour).
local function outfitColor(value, palette)
	if typeof(value) == "Color3" then
		return value
	elseif type(value) == "string" then
		local color = palette and palette[value]
		return typeof(color) == "Color3" and color or nil
	end
	return nil
end

-- The colours an outfit gives the torso, arms and legs in `palette` (nil: that body colour stays).
-- (The wardrobe's dress forms in Builders/StadiumRooms.lua show these.)
function Gear.OutfitColors(key, palette)
	local spec = OUTFITS[key]
	if not spec then
		return nil, nil, nil
	end
	return outfitColor(spec.Torso, palette), outfitColor(spec.Arms, palette), outfitColor(spec.Legs, palette)
end

-- Puts away what the character wears now and remembers its colours (the first outfit only).
local function stash(player, character)
	local state = { player = player, character = character, clothes = {}, partColors = {}, hidden = {}, base = {} }
	local original = character:FindFirstChildOfClass("BodyColors")
	for _, field in ipairs(COLOR_FIELDS) do
		local color = original and original[field]
		if not color then
			for _, partName in ipairs(FIELD_PART[field]) do
				local part = character:FindFirstChild(partName)
				if part and part:IsA("BasePart") then
					color = part.Color
					break
				end
			end
		end
		state.base[field] = color or Color3.fromRGB(163, 162, 165)
	end
	for _, child in ipairs(character:GetChildren()) do
		if child:IsA("BasePart") and BODY_FIELD[child.Name] then
			state.partColors[child] = child.Color
		elseif child:IsA("Clothing") or child:IsA("ShirtGraphic") then
			table.insert(state.clothes, child) -- (Shirt and Pants are Clothing)
		end
	end
	for _, item in ipairs(state.clothes) do
		item.Parent = nil
	end
	if original then
		state.bodyColors = original
		original.Parent = nil
	end
	local colors = Instance.new("BodyColors")
	colors.Name = OUTFIT_COLORS
	for field, color in pairs(state.base) do
		colors[field] = color
	end
	colors.Parent = character
	state.colors = colors
	return state
end

-- One part of an outfit, welded (a Weld with a fixed offset) to a body part.
local function attach(folder, body, name, size, offset, color, material, shape)
	local part = Instance.new("Part")
	part.Name = name
	if shape then
		part.Shape = shape
	end
	part.Size = size
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.Massless = true
	part.Anchored = false
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.CFrame = body.CFrame * offset
	local weld = Instance.new("Weld")
	weld.Name = "OutfitWeld"
	weld.Part0 = body
	weld.Part1 = part
	weld.C0 = offset
	weld.Parent = part
	part.Parent = folder
	return part
end

-- A thin bar from a to b (body-local points), its length along a -> b.
local function bar(folder, body, name, a, b, thickness, color, material)
	return attach(folder, body, name, Vector3.new(thickness, thickness, (b - a).Magnitude), CFrame.lookAt((a + b) / 2, b), color, material)
end

-- "Sam_The-Builder 99" -> "SAMTHEBUILDER" (the jersey's name bar: letters only, 12 at most)
local function jerseyName(player)
	local name = string.upper(tostring(player.DisplayName)):gsub("[^%a ]", "")
	name = name:gsub("^%s+", ""):gsub("%s+$", "")
	if name == "" then
		name = "COACH"
	end
	return name:sub(1, 12)
end

-- The outfit's own parts for `spec` (cap, headset, lanyard + whistle, hood, jersey lettering).
local function buildParts(state, spec)
	local character, palette = state.character, state.palette or {}
	local primary = outfitColor("Primary", palette) or Color3.fromRGB(28, 78, 200)
	local secondary = outfitColor("Secondary", palette) or WHITE
	local folder = Instance.new("Folder")
	folder.Name = OUTFIT_FOLDER

	local head = character:FindFirstChild("Head")
	if head and head:IsA("BasePart") then
		-- r: the head's radius (its hat attachment sits on top of it; R6 and R15 heads are ~0.6)
		local hat = head:FindFirstChild("HatAttachment")
		local r = math.clamp(hat and hat:IsA("Attachment") and hat.Position.Y or 0.6, 0.4, 1.2)
		local top = r -- the headset's band rests on the head... or on the cap
		if spec.Cap then
			attach(
				folder,
				head,
				"CapCrown",
				Vector3.new(0.62 * r, 2.15 * r, 2.15 * r),
				CFrame.new(0, 0.8 * r, 0) * CFrame.Angles(0, 0, math.rad(90)),
				primary,
				Enum.Material.Fabric,
				Enum.PartType.Cylinder
			)
			attach(folder, head, "CapBrim", Vector3.new(1.7 * r, 0.08, 1.1 * r), CFrame.new(0, 0.55 * r, -1.45 * r), secondary)
			top = 1.12 * r
		end
		if spec.Headset then
			local side = 1.12 * r
			attach(folder, head, "HeadsetBand", Vector3.new(2 * side + 0.12, 0.12, 0.22), CFrame.new(0, top + 0.06, 0), HEADSET)
			for _, s in ipairs({ -1, 1 }) do
				attach(folder, head, "HeadsetArm", Vector3.new(0.12, top + 0.06, 0.18), CFrame.new(s * side, (top + 0.06) / 2, 0), HEADSET)
				attach(
					folder,
					head,
					"EarCup",
					Vector3.new(0.3, 0.62 * r * 1.6, 0.62 * r * 1.6),
					CFrame.new(s * (side + 0.05), 0, 0),
					secondary,
					Enum.Material.SmoothPlastic,
					Enum.PartType.Cylinder
				)
			end
			-- the microphone boom from the left ear cup round to the mouth
			bar(folder, head, "MicBoom", Vector3.new(-side, -0.1 * r, -0.2 * r), Vector3.new(-0.3 * r, -0.55 * r, -1.08 * r), 0.08, HEADSET)
			attach(
				folder,
				head,
				"Mic",
				Vector3.new(0.18, 0.18, 0.18),
				CFrame.new(-0.3 * r, -0.55 * r, -1.08 * r),
				INK,
				nil,
				Enum.PartType.Ball
			)
		end
	end

	local torso = character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
	if torso and torso:IsA("BasePart") then
		local t = torso.Size
		local front, back, shoulders = -t.Z / 2, t.Z / 2, t.Y / 2
		if spec.Lanyard then
			local bottom = Vector3.new(0, shoulders - 0.8, front - 0.07)
			for _, s in ipairs({ -1, 1 }) do
				bar(
					folder,
					torso,
					"Lanyard",
					Vector3.new(s * 0.32, shoulders - 0.02, front + 0.12),
					bottom,
					0.07,
					secondary,
					Enum.Material.Fabric
				)
			end
			attach(
				folder,
				torso,
				"LanyardWhistle",
				Vector3.new(0.2, 0.34, 0.16),
				CFrame.new(0, shoulders - 0.98, front - 0.1),
				CHROME,
				Enum.Material.Metal
			)
		end
		if spec.Hood then
			attach(
				folder,
				torso,
				"Hood",
				Vector3.new(t.X * 0.55, 0.5, 0.55),
				CFrame.new(0, shoulders + 0.05, back - 0.1),
				shade(primary, 0.85),
				Enum.Material.Fabric
			)
			attach(
				folder,
				torso,
				"HoodiePocket",
				Vector3.new(t.X * 0.6, t.Y * 0.24, 0.06),
				CFrame.new(0, -t.Y * 0.24, front - 0.03),
				shade(primary, 0.78),
				Enum.Material.Fabric
			)
			for _, s in ipairs({ -1, 1 }) do
				attach(
					folder,
					torso,
					"Drawstring",
					Vector3.new(0.06, 0.55, 0.05),
					CFrame.new(s * 0.2, shoulders - 0.35, front - 0.03),
					WHITE,
					Enum.Material.Fabric
				)
			end
		end
		if spec.Jersey then
			local lettering = readableOn(primary, { outfitColor("Trim", palette) or WHITE, secondary, WHITE, INK })
			for _, s in ipairs({ -1, 1 }) do
				attach(
					folder,
					torso,
					"ShoulderStripe",
					Vector3.new(t.X * 0.22, 0.06, t.Z + 0.04),
					CFrame.new(s * t.X * 0.36, shoulders + 0.02, 0),
					secondary
				)
			end
			-- the name and number on the back, the number again on the front: thin panels in the
			-- jersey's colour that carry the lettering (Back = their outer face)
			local number = tostring(state.player.UserId % 98 + 1)
			for _, side in ipairs({ { "JerseyBack", back + 0.03, 0 }, { "JerseyFront", front - 0.03, math.pi } }) do
				local panel = attach(
					folder,
					torso,
					side[1],
					Vector3.new(t.X * 0.8, t.Y * 0.78, 0.05),
					CFrame.new(0, -t.Y * 0.04, side[2]) * CFrame.Angles(0, side[3], 0),
					primary,
					Enum.Material.Fabric
				)
				local gui = Instance.new("SurfaceGui")
				gui.Name = "JerseyGui"
				gui.Face = Enum.NormalId.Back
				gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
				gui.PixelsPerStud = 50
				gui.Parent = panel
				local isBack = side[1] == "JerseyBack"
				if isBack then
					local nameLabel = Instance.new("TextLabel")
					nameLabel.Name = "JerseyName"
					nameLabel.BackgroundTransparency = 1
					nameLabel.Position = UDim2.new(0.05, 0, 0.02, 0)
					nameLabel.Size = UDim2.new(0.9, 0, 0.22, 0)
					nameLabel.Font = Enum.Font.GothamBlack
					nameLabel.Text = jerseyName(state.player)
					nameLabel.TextColor3 = lettering
					nameLabel.TextScaled = true
					nameLabel.Parent = gui
				end
				local numberLabel = Instance.new("TextLabel")
				numberLabel.Name = "JerseyNumber"
				numberLabel.BackgroundTransparency = 1
				numberLabel.Position = UDim2.new(0.1, 0, isBack and 0.26 or 0.12, 0)
				numberLabel.Size = UDim2.new(0.8, 0, isBack and 0.7 or 0.6, 0)
				numberLabel.Font = Enum.Font.GothamBlack
				numberLabel.Text = number
				numberLabel.TextColor3 = lettering
				numberLabel.TextScaled = true
				numberLabel.Parent = gui
			end
		end
	end
	folder.Parent = character
	return folder
end

-- Puts the state's outfit on (over the original body colours) in the state's palette.
local function dress(state)
	local spec = OUTFITS[state.outfit]
	local character, palette = state.character, state.palette
	local colors = table.clone(state.base)
	local torso, arms, legs = outfitColor(spec.Torso, palette), outfitColor(spec.Arms, palette), outfitColor(spec.Legs, palette)
	colors.TorsoColor3 = torso or colors.TorsoColor3
	colors.LeftArmColor3 = arms or colors.LeftArmColor3
	colors.RightArmColor3 = arms or colors.RightArmColor3
	colors.LeftLegColor3 = legs or colors.LeftLegColor3
	colors.RightLegColor3 = legs or colors.RightLegColor3
	for field, color in pairs(colors) do
		state.colors[field] = color
	end
	-- (straight onto the body parts too, so the change shows at once)
	for part in pairs(state.partColors) do
		if part.Parent == character then
			part.Color = colors[BODY_FIELD[part.Name]]
		end
	end
	-- hide what would cover the outfit: layered clothing, and hats under a cap or a hood
	for _, accessory in ipairs(character:GetChildren()) do
		local handle = accessory:IsA("Accessory") and accessory:FindFirstChild("Handle")
		if handle and handle:IsA("BasePart") then
			local hat = accessory.AccessoryType == Enum.AccessoryType.Hat or handle:FindFirstChild("HatAttachment") ~= nil
			if handle:FindFirstChildOfClass("WrapLayer") or ((spec.Cap or spec.Hood) and hat) then
				state.hidden[handle] = handle.Transparency
				handle.Transparency = 1
			end
		end
	end
	-- (an unusual avatar must never break the outfit's colours or "Change back")
	local ok, folder = pcall(buildParts, state, spec)
	if ok then
		state.folder = folder
	else
		warn("[Gear] couldn't add the outfit's parts: " .. tostring(folder))
	end
end

-- Takes the outfit's parts off and shows hidden accessories again (the clothes stay put away).
local function strip(state)
	if state.folder then
		state.folder:Destroy()
		state.folder = nil
	end
	for handle, transparency in pairs(state.hidden) do
		if handle.Parent then
			handle.Transparency = transparency
		end
	end
	state.hidden = {}
end

--[[
	Dresses `player` in an outfit (a key of OUTFITS) in the team colours of `plot` (the plot whose
	wardrobe it came from). Returns true, message or false, message.
]]
function Gear.Wear(player, key, plot)
	local spec = OUTFITS[key]
	if not spec then
		return false, "That outfit isn't in the wardrobe."
	end
	local character = aliveCharacter(player)
	if not character then
		return false, "You can't change right now."
	end
	local state = current(player)
	if state and state.outfit == key then
		return false, ("You're already wearing the %s!"):format(spec.Name)
	end
	if state then
		strip(state)
	else
		state = stash(player, character)
		worn[player] = state
	end
	state.outfit = key
	state.plot = plot
	state.owner = plot and plot.Owner
	state.palette = plot and plot.Palette
	dress(state)
	return true, ("%s on - looking sharp, Coach! Change back at YOUR CLOTHES."):format(spec.Name)
end

-- Puts the player's own clothes back on, exactly as they were. Returns true / false, message.
function Gear.ChangeBack(player)
	local state = current(player)
	if not state then
		return false, "You're already wearing your own clothes."
	end
	worn[player] = nil
	strip(state)
	local character = state.character
	state.colors:Destroy()
	for part, color in pairs(state.partColors) do
		if part.Parent == character then
			part.Color = color
		end
	end
	if state.bodyColors then
		state.bodyColors.Parent = character
	end
	for _, item in ipairs(state.clothes) do
		item.Parent = character
	end
	return true, "Back in your own clothes!"
end

-- The outfit the player's character wears now (a key of OUTFITS), or nil.
function Gear.Wearing(player)
	local state = current(player)
	return state and state.outfit or nil
end

-- A plot's team colours changed: outfits from its wardrobe take the new colours.
local function onTeamApplied(plot)
	for player in pairs(worn) do
		local state = current(player)
		if state and state.plot == plot and plot.Owner ~= nil and plot.Owner == state.owner and state.palette ~= plot.Palette then
			strip(state)
			state.palette = plot.Palette
			dress(state)
		end
	end
end
Gear._onTeamApplied = onTeamApplied -- (for tests)

function Gear.Init(plotManager)
	plotManager.OnTeamApplied(onTeamApplied)
	local function watch(player)
		player.CharacterAdded:Connect(function()
			worn[player] = nil -- a new character comes in the player's own clothes
		end)
	end
	Players.PlayerAdded:Connect(watch)
	for _, player in ipairs(Players:GetPlayers()) do
		watch(player)
	end
	Players.PlayerRemoving:Connect(function(player)
		worn[player] = nil
	end)
end

return Gear
