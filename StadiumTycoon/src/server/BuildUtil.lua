--[[
	BuildUtil
	Small helpers for creating anchored parts in plot-local space.

	Every builder receives a `ctx` (context) table:
	  ctx.origin    CFrame of the plot origin in the world (plot-local (0,0,0), y = 0 is the plot surface)
	  ctx.parent    Instance that new parts are parented to (the item's Model)
	  ctx.colors    team palette: { Primary = Color3, Secondary = Color3, Trim = Color3 }
	  ctx.teamName  short upper-case name of the owner, e.g. "SAMXYZ"
	  ctx.config    the shared Config module (ctx.config.Layout, ctx.config.Colors)
	  ctx.onlyStage when set, only parts of that STEP are kept (see BuildUtil.Stage)

	STEPS: every piece is bought in several steps. A builder builds the WHOLE piece and calls
	BuildUtil.Stage(ctx, n) before the parts that belong to step n. When the game builds step n
	(ctx.onlyStage = n), parts of other steps are still created but never parented, so they don't
	exist in the world; anything attached to them (text, lights, welds) disappears with them.

	All positions/CFrames passed to these helpers are LOCAL to the plot.
	This module only uses Instance/CFrame/Vector3/Color3/Enum/UDim2 so it can also be run
	outside Roblox (tools/ uses it to render previews of the stadium).
]]

local BuildUtil = {}

local DEFAULT_COLOR = Color3.fromRGB(163, 162, 165)

function BuildUtil.NewContext(origin, parent, colors, teamName, config, onlyStage)
	return {
		origin = origin,
		parent = parent,
		colors = colors,
		teamName = teamName,
		config = config,
		onlyStage = onlyStage,
		-- shared by every child context (table.clone is shallow), so Stage() affects them all
		stageState = { current = 1, highest = 1, parts = {} },
	}
end

-- Marks the parts created after this call as belonging to step `stage` (1, 2, 3...).
function BuildUtil.Stage(ctx, stage)
	local state = ctx.stageState
	if state then
		state.current = stage
		state.highest = math.max(state.highest, stage)
	end
end

-- True if parts created right now should exist (they belong to the step being built).
function BuildUtil.IsActive(ctx)
	if not ctx.onlyStage then
		return true
	end
	local state = ctx.stageState
	return (state and state.current or 1) == ctx.onlyStage
end

-- Creates a Model under ctx.parent and returns a copy of ctx that builds into it.
function BuildUtil.Child(ctx, name)
	local model = Instance.new("Model")
	model.Name = name
	model.Parent = ctx.parent
	local child = table.clone(ctx)
	child.parent = model
	return child, model
end

-- Converts a plot-local CFrame into a world CFrame.
function BuildUtil.ToWorld(ctx, localCFrame)
	return ctx.origin * localCFrame
end

local function resolveLocalCFrame(props)
	if props.CFrame then
		return props.CFrame
	elseif props.Position then
		return CFrame.new(props.Position)
	end
	return CFrame.new()
end

local function finishPart(ctx, part, props, localCFrame)
	part.Name = props.Name or "Part"
	part.Anchored = true
	part.Size = props.Size or Vector3.new(4, 1, 2)
	part.CFrame = ctx.origin * localCFrame
	part.Color = props.Color or DEFAULT_COLOR
	part.Material = props.Material or Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	if props.Transparency ~= nil then
		part.Transparency = props.Transparency
	end
	if props.Reflectance ~= nil then
		part.Reflectance = props.Reflectance
	end
	if props.CanCollide ~= nil then
		part.CanCollide = props.CanCollide
	end
	if props.CastShadow ~= nil then
		part.CastShadow = props.CastShadow
	end
	local state = ctx.stageState
	if state then
		state.parts[state.current] = (state.parts[state.current] or 0) + 1
	end
	if BuildUtil.IsActive(ctx) then
		part.Parent = props.Parent or ctx.parent
	end
	-- (parts of other steps stay unparented and are simply garbage collected)
	return part
end

-- Removes models/folders that ended up with no parts (e.g. a sub-model whose parts all
-- belong to other steps).
function BuildUtil.PruneEmpty(root)
	local descendants = root:GetDescendants()
	for index = #descendants, 1, -1 do
		local inst = descendants[index]
		if (inst:IsA("Model") or inst:IsA("Folder")) and inst.Parent ~= nil then
			local hasPart = false
			for _, d in ipairs(inst:GetDescendants()) do
				if d:IsA("BasePart") then
					hasPart = true
					break
				end
			end
			if not hasPart then
				inst:Destroy()
			end
		end
	end
end

--[[
	Creates a block (or Ball/Cylinder if props.Shape is set) Part.
	props: Name, Size, CFrame (local) or Position (local Vector3), Color, Material, Shape,
	       Transparency, Reflectance, CanCollide, CastShadow, Parent
]]
function BuildUtil.Part(ctx, props)
	local part = Instance.new("Part")
	if props.Shape then
		part.Shape = props.Shape
	end
	return finishPart(ctx, part, props, resolveLocalCFrame(props))
end

-- Shorthand for an axis-aligned block centred at local `position`.
function BuildUtil.Box(ctx, name, size, position, color, material, extra)
	local props = extra and table.clone(extra) or {}
	props.Name = name
	props.Size = size
	props.Position = position
	props.Color = color
	props.Material = material
	return BuildUtil.Part(ctx, props)
end

-- Shorthand for a block whose BOTTOM sits at local y = baseY (handy for things standing on the ground).
-- `position` is the centre of the footprint (its Y is ignored).
function BuildUtil.Block(ctx, name, size, position, color, material, extra, baseY)
	local y = (baseY or 0) + size.Y / 2
	return BuildUtil.Box(ctx, name, size, Vector3.new(position.X, y, position.Z), color, material, extra)
end

-- WedgePart. Roblox wedges have their tall vertical face at local +Z (back) and the slope
-- descends toward local -Z (the LookVector / front). props are the same as BuildUtil.Part.
function BuildUtil.Wedge(ctx, props)
	local wedge = Instance.new("WedgePart")
	return finishPart(ctx, wedge, props, resolveLocalCFrame(props))
end

--[[
	Cylinder along an axis.
	props: Name, Position (local centre), Height (length along the axis), Diameter,
	       Axis = "X" | "Y" | "Z" (default "Y"), Color, Material, Transparency, ...
]]
function BuildUtil.Cylinder(ctx, props)
	local axis = props.Axis or "Y"
	local rotation
	if axis == "X" then
		rotation = CFrame.new()
	elseif axis == "Z" then
		rotation = CFrame.Angles(0, math.rad(90), 0)
	else
		rotation = CFrame.Angles(0, 0, math.rad(90))
	end
	local position = props.Position or Vector3.new()
	local cylinderProps = table.clone(props)
	cylinderProps.Shape = Enum.PartType.Cylinder
	cylinderProps.Size = Vector3.new(props.Height or 4, props.Diameter or 2, props.Diameter or 2)
	cylinderProps.CFrame = CFrame.new(position) * rotation
	cylinderProps.Position = nil
	return BuildUtil.Part(ctx, cylinderProps)
end

-- Sphere. props: Name, Position (local centre), Diameter, Color, Material, ...
function BuildUtil.Ball(ctx, props)
	local ballProps = table.clone(props)
	ballProps.Shape = Enum.PartType.Ball
	local diameter = props.Diameter or 2
	ballProps.Size = Vector3.new(diameter, diameter, diameter)
	return BuildUtil.Part(ctx, ballProps)
end

--[[
	Puts text on one face of a part.
	face: Enum.NormalId
	opts: LabelName, TextColor3, BackgroundColor3, BackgroundTransparency (default 1),
	      Font, PixelsPerStud (default 20), LightInfluence (default 1), TextStrokeTransparency
	Returns the SurfaceGui and the TextLabel (so callers can update the text later).
]]
function BuildUtil.SurfaceText(part, face, text, opts)
	opts = opts or {}
	local gui = Instance.new("SurfaceGui")
	gui.Name = (opts.LabelName or "Label") .. "Gui"
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = opts.PixelsPerStud or 20
	gui.LightInfluence = opts.LightInfluence or 1
	gui.Parent = part

	local label = Instance.new("TextLabel")
	label.Name = opts.LabelName or "Label"
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundColor3 = opts.BackgroundColor3 or Color3.new(0, 0, 0)
	label.BackgroundTransparency = opts.BackgroundTransparency or 1
	label.BorderSizePixel = 0
	label.Font = opts.Font or Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = opts.TextColor3 or Color3.new(1, 1, 1)
	label.TextScaled = true
	label.TextStrokeTransparency = opts.TextStrokeTransparency or 1
	label.Parent = gui
	return gui, label
end

--[[
	Floating text above a part (always faces the camera).
	opts: LabelName, Size (UDim2, default 12x3 studs), StudsOffset (Vector3), TextColor3,
	      BackgroundColor3, BackgroundTransparency, Font, MaxDistance, AlwaysOnTop
]]
function BuildUtil.Billboard(part, text, opts)
	opts = opts or {}
	local gui = Instance.new("BillboardGui")
	gui.Name = (opts.LabelName or "Label") .. "Billboard"
	gui.Size = opts.Size or UDim2.new(12, 0, 3, 0)
	gui.StudsOffset = opts.StudsOffset or Vector3.new(0, 4, 0)
	gui.MaxDistance = opts.MaxDistance or 150
	gui.AlwaysOnTop = opts.AlwaysOnTop or false
	gui.LightInfluence = 0
	gui.Parent = part

	local label = Instance.new("TextLabel")
	label.Name = opts.LabelName or "Label"
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundColor3 = opts.BackgroundColor3 or Color3.new(0, 0, 0)
	label.BackgroundTransparency = opts.BackgroundTransparency or 1
	label.BorderSizePixel = 0
	label.Font = opts.Font or Enum.Font.GothamBlack
	label.Text = text
	label.TextColor3 = opts.TextColor3 or Color3.new(1, 1, 1)
	label.TextScaled = true
	label.TextStrokeTransparency = opts.TextStrokeTransparency or 0.4
	label.Parent = gui
	return gui, label
end

--[[
	Adds a light to a part.
	className: "PointLight" | "SpotLight" | "SurfaceLight"
	props: any light properties, e.g. { Name = "FloodLight", Range = 60, Brightness = 4, Face = Enum.NormalId.Front }
]]
function BuildUtil.Light(part, className, props)
	local light = Instance.new(className)
	for key, value in pairs(props or {}) do
		light[key] = value
	end
	light.Parent = part
	return light
end

---------------------------------------------------------------------------------------------
-- INTERACTIONS
-- Everything a player can interact with gets a ProximityPrompt named "Interact" ("Press E",
-- or tap on a phone). Its "Kind" attribute says what it does - see src/shared/Interact.lua.
-- The server (Interactions.lua) and client (Interact.client.lua) do the rest, so builders only
-- describe WHAT can be done, here, with these helpers. Prompts belong to the step of their part.
---------------------------------------------------------------------------------------------

-- Prompt hosts that a part of another piece covers (the 50-yard line runs across the midfield
-- logo's centre): with line of sight they could never show. (Prompts buried in a part of their own
-- piece are found by Interactions.Decorate.)
local NO_LINE_OF_SIGHT_HOSTS = { LogoDisk = true }

--[[
	Adds an "Interact" prompt to `host` (a part, or an Attachment).
	spec: Kind ("look" | "door" | "seat" | "elevator" | "use"), Action (button text, e.g. "Look"),
	      Object (small text above it, e.g. "Draft Board"), Distance (default 10), Hold (seconds),
	      At (Vector3 offset in the part's own space: the prompt shows there instead of the centre),
	      Attributes (table copied onto the prompt),
	      LineOfSight (true = hidden behind walls and floors. Default: true for look / use prompts
	      on a solid part; false for doors (the prompt sits inside the closed leaf), seats,
	      elevators and see-through hosts)
]]
function BuildUtil.Prompt(host, spec)
	if spec.At and host:IsA("BasePart") then
		local attachment = Instance.new("Attachment")
		attachment.Name = "PromptAt"
		attachment.Position = spec.At
		attachment.Parent = host
		host = attachment
	end
	local lineOfSight = spec.LineOfSight
	if lineOfSight == nil then
		local part = host:IsA("Attachment") and host.Parent or host
		lineOfSight = (spec.Kind == "look" or spec.Kind == "use")
			and part ~= nil
			and part:IsA("BasePart")
			and part.Transparency < 0.5
			and not NO_LINE_OF_SIGHT_HOSTS[part.Name]
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "Interact"
	prompt.ActionText = spec.Action or ""
	prompt.ObjectText = spec.Object or ""
	prompt.HoldDuration = spec.Hold or 0
	prompt.MaxActivationDistance = spec.Distance or 10
	prompt.RequiresLineOfSight = lineOfSight == true
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt:SetAttribute("Kind", spec.Kind)
	for key, value in pairs(spec.Attributes or {}) do
		prompt:SetAttribute(key, value)
	end
	prompt.Parent = host
	return prompt
end

--[[
	"Press E to look": shows a card with `title` and `info` (one or two short sentences).
	opts: LookKey (adds live info from the owner's team, see Interact.LookKeys, e.g. "roster:QB",
	      "locker:3", "record"), Action (default "Look"), Distance, At, LineOfSight (see Prompt)
]]
function BuildUtil.Look(part, title, info, opts)
	opts = opts or {}
	return BuildUtil.Prompt(part, {
		Kind = "look",
		Action = opts.Action or "Look",
		Object = title,
		Distance = opts.Distance,
		At = opts.At,
		LineOfSight = opts.LineOfSight,
		Attributes = { Title = title, Info = info or "", LookKey = opts.LookKey },
	})
end

--[[
	A "use" action (Interact.Uses): use = "lift" | "arcade" | "pingpong" | "podium" (mini-games)
	or "tray" | "smoothie" | "hotdog" | "popcorn" | "soda" | "sportsdrink" | "foamfinger" (items).
	opts: Action (button text; default from Interact.Uses), Object, Title, Info, Distance, At,
	      LineOfSight (see Prompt),
	      Camera = { From = Vector3, To = Vector3, Fov = number } (local; podium / arcade view)
]]
function BuildUtil.Use(ctx, part, use, opts)
	opts = opts or {}
	local attributes = { Use = use, Title = opts.Title, Info = opts.Info }
	if opts.Camera then
		attributes.CameraCFrame = ctx.origin * CFrame.lookAt(opts.Camera.From, opts.Camera.To)
		attributes.CameraFov = opts.Camera.Fov or 50
	end
	return BuildUtil.Prompt(part, {
		Kind = "use",
		Action = opts.Action,
		Object = opts.Object or "",
		Distance = opts.Distance,
		At = opts.At,
		LineOfSight = opts.LineOfSight,
		Attributes = attributes,
	})
end

--[[
	A door that opens with a prompt (and closes again by itself).
	props:
	  Name       model name (default "Door")
	  Size       size of the whole closed door: X = width, Y = height, Z = thickness
	  CFrame     local CFrame of the closed door's centre (its X axis runs across the doorway)
	  Double     two leaves that open from the middle
	  Slide      slides sideways (elevator / glass doors) instead of swinging on hinges
	  Swing      hinge angle in degrees (default 95). Leaves swing toward the door's FRONT (its -Z,
	             the LookVector side); use a negative number to swing toward its back (+Z)
	  Hinge      "Left" or "Right" (single swinging door: the hinge side, in the door's own X)
	  Color, Material, Transparency  of the leaves
	  Window     true = a glass panel in each leaf
	  Object     prompt label (default "Door"); Info / Title / LookKey for a description card
	  AutoClose  seconds before it closes again (default 6, 0 = stays open)
	  Distance   prompt distance (default 10)
	Returns the door Model. Parts of the door (handles, windows) move together with their leaf.
]]
function BuildUtil.Door(ctx, props)
	local doorCtx, model = BuildUtil.Child(ctx, props.Name or "Door")
	local size = props.Size
	local closed = props.CFrame
	local leaves = {}
	if props.Double then
		local half = size.X / 2
		leaves[1] = { offset = -half / 2, width = half, hingeX = -half / 2, sign = 1 }
		leaves[2] = { offset = half / 2, width = half, hingeX = half / 2, sign = -1 }
	else
		local right = props.Hinge == "Right"
		leaves[1] = { offset = 0, width = size.X, hingeX = right and size.X / 2 or -size.X / 2, sign = right and -1 or 1 }
	end
	local swing = props.Swing or 95
	for index, leaf in ipairs(leaves) do
		local leafCFrame = closed * CFrame.new(leaf.offset, 0, 0)
		local part = BuildUtil.Part(doorCtx, {
			Name = "DoorLeaf",
			Size = Vector3.new(leaf.width - 0.1, size.Y, size.Z),
			CFrame = leafCFrame,
			Color = props.Color or Color3.fromRGB(120, 85, 55),
			Material = props.Material or Enum.Material.Wood,
			Transparency = props.Transparency,
		})
		local handleX = leaf.sign * (leaf.width / 2 - 0.5) -- on the side away from the hinge
		if props.Slide then
			handleX = 0
		end
		local handle = BuildUtil.Part(doorCtx, {
			Name = "DoorHandle",
			Size = Vector3.new(0.25, 1.4, size.Z + 0.5),
			CFrame = leafCFrame * CFrame.new(handleX, -size.Y / 2 + 3.6, 0),
			Color = Color3.fromRGB(200, 200, 205),
			Material = Enum.Material.Metal,
			CanCollide = false,
		})
		local moving = { part, handle }
		if props.Window then
			local window = BuildUtil.Part(doorCtx, {
				Name = "DoorWindow",
				Size = Vector3.new(math.max(0.6, leaf.width * 0.5), size.Y * 0.35, size.Z + 0.1),
				CFrame = leafCFrame * CFrame.new(0, size.Y * 0.18, 0),
				Color = Color3.fromRGB(170, 210, 235),
				Material = Enum.Material.Glass,
				Transparency = 0.45,
				CanCollide = false,
			})
			table.insert(moving, window)
		end
		-- the pivot is the hinge line (or the leaf centre for sliding doors); "Open<i>" is how the
		-- leaf moves relative to it
		local pivotLocal, openOffset
		if props.Slide then
			pivotLocal = leafCFrame
			local slideX = props.Double and (leaf.sign * -leaf.width) or -leaf.width
			openOffset = CFrame.new(slideX, 0, 0)
		else
			pivotLocal = leafCFrame * CFrame.new(leaf.hingeX, 0, 0)
			openOffset = CFrame.Angles(0, math.rad(swing * leaf.sign), 0)
		end
		model:SetAttribute("Pivot" .. index, ctx.origin * pivotLocal)
		model:SetAttribute("Open" .. index, openOffset)
		for _, p in ipairs(moving) do
			p:SetAttribute("Leaf", index)
			p:SetAttribute("ClosedCFrame", p.CFrame)
		end
	end
	model:SetAttribute("Leaves", #leaves)
	model:SetAttribute("AutoClose", props.AutoClose or 6)
	model:SetAttribute("Sliding", props.Slide == true)
	-- the prompt sits on an invisible marker in the middle of the doorway (it never moves)
	local marker = BuildUtil.Part(doorCtx, {
		Name = "DoorPrompt",
		Size = Vector3.new(1, 1, 1),
		CFrame = closed * CFrame.new(0, -size.Y / 2 + 4, 0),
		Transparency = 1,
		CanCollide = false,
	})
	marker.CanTouch = false
	marker.CanQuery = false
	BuildUtil.Prompt(marker, {
		Kind = "door",
		Action = "Open",
		Object = props.Object or "Door",
		Distance = props.Distance or 10,
		LineOfSight = false, -- (the marker sits inside the closed leaf)
		Attributes = { Title = props.Title, Info = props.Info, LookKey = props.LookKey },
	})
	return model
end

--[[
	A seat players can sit in (touch it or press E).
	props: Name, Size (default 2 x 1 x 2), CFrame (local; a seated player faces the seat's -Z,
	       its LookVector), Color, Material, Object (prompt label, default "Seat"),
	       Camera = { From = Vector3, To = Vector3, Fov = 40, Label = "PRESS BOX CAM" } (local):
	       sitting switches the player's camera to this TV-style view.
	       NoPrompt = true to skip the prompt (rows of plain chairs: touching still seats you)
]]
function BuildUtil.Seat(ctx, props)
	local seat = Instance.new("Seat")
	local seatProps = table.clone(props)
	seatProps.Name = props.Name or "Seat"
	seatProps.Size = props.Size or Vector3.new(2, 1, 2)
	seatProps.Color = props.Color or Color3.fromRGB(40, 40, 46)
	finishPart(ctx, seat, seatProps, resolveLocalCFrame(props))
	if props.Camera then
		seat:SetAttribute("CameraCFrame", ctx.origin * CFrame.lookAt(props.Camera.From, props.Camera.To))
		seat:SetAttribute("CameraFov", props.Camera.Fov or 40)
		seat:SetAttribute("CameraLabel", props.Camera.Label or "LIVE")
	end
	if not props.NoPrompt then
		-- (no line of sight: chair backs and arms would hide it; Interactions hides it while the
		-- seat is taken)
		BuildUtil.Prompt(seat, {
			Kind = "seat",
			Action = "Sit",
			Object = props.Object or (props.Camera and "TV Camera Seat" or "Seat"),
			Distance = 8,
			LineOfSight = false,
		})
	end
	return seat
end

--[[
	An elevator (or staircase) call button: rides the player to `target`.
	target: local CFrame where the player arrives (standing on a floor there; they face its -Z)
	opts: Action (default "Ride the elevator"), Object (default "Elevator"),
	      Label (shown when you arrive, e.g. "PRESS LEVEL"), Distance, At,
	      LineOfSight (default false: a lift button must never hide behind a rail or a column)
]]
function BuildUtil.Elevator(ctx, part, target, opts)
	opts = opts or {}
	return BuildUtil.Prompt(part, {
		Kind = "elevator",
		Action = opts.Action or "Ride the elevator",
		Object = opts.Object or "Elevator",
		Distance = opts.Distance,
		At = opts.At,
		LineOfSight = opts.LineOfSight,
		Attributes = { Target = ctx.origin * target, Label = opts.Label or "" },
	})
end

--[[
	Text that the server keeps up to date with the owner's team (Interact.LiveKinds):
	"team", "score", "record", "season", "titles", "rating", "summary", "gameday", "roster",
	"arcade", "pingpong", "owner". Same opts as SurfaceText (+ Text = placeholder).
]]
function BuildUtil.LiveText(part, face, live, opts)
	opts = opts or {}
	local gui, label = BuildUtil.SurfaceText(part, face, opts.Text or "", opts)
	label:SetAttribute("Live", live)
	return gui, label
end

--[[
	Builds stepped stadium rows (solid blocks from the ground up, like real seating bowls).

	opts:
	  Name          prefix for part names
	  StartCFrame   local CFrame at ground level, at the FRONT-CENTRE of the first row.
	                The rows step away along this CFrame's -Z (LookVector) direction.
	  Length        length of each row (along the CFrame's X axis)
	  Rows          number of rows
	  RowDepth      depth of each row (default Layout.RowDepth)
	  RowRise       height added per row (default Layout.RowRise)
	  FirstHeight   height of the first row (default RowRise)
	  Colors        list of Color3 that alternate per row
	  SeatColor     colour of the seat strip on top of each row (nil = no strips)
	  Material      material of the row blocks (default Concrete)
	Returns the list of created row parts.
]]
function BuildUtil.Rows(ctx, opts)
	local layout = ctx.config.Layout
	local rowDepth = opts.RowDepth or layout.RowDepth
	local rowRise = opts.RowRise or layout.RowRise
	local firstHeight = opts.FirstHeight or rowRise
	local colors = opts.Colors or { DEFAULT_COLOR }
	local parts = {}
	for row = 1, opts.Rows do
		local height = firstHeight + (row - 1) * rowRise
		local offset = (row - 0.5) * rowDepth
		local rowCFrame = opts.StartCFrame * CFrame.new(0, height / 2, -offset)
		local block = BuildUtil.Part(ctx, {
			Name = (opts.Name or "Row") .. row,
			Size = Vector3.new(opts.Length, height, rowDepth),
			CFrame = rowCFrame,
			Color = colors[(row - 1) % #colors + 1],
			Material = opts.Material or Enum.Material.Concrete,
		})
		table.insert(parts, block)
		if opts.SeatColor then
			-- a thin seat-back strip along the back edge of the row top
			BuildUtil.Part(ctx, {
				Name = (opts.Name or "Row") .. row .. "Seats",
				Size = Vector3.new(opts.Length - 1, 0.8, 1),
				CFrame = rowCFrame * CFrame.new(0, height / 2 + 0.4, -(rowDepth / 2 - 0.5)),
				Color = opts.SeatColor,
				Material = Enum.Material.SmoothPlastic,
			})
		end
	end
	return parts
end

return BuildUtil
