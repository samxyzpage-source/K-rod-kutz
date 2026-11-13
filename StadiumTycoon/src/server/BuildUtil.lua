--[[
	BuildUtil
	Small helpers for creating anchored parts in plot-local space.

	Every builder receives a `ctx` (context) table:
	  ctx.origin    CFrame of the plot origin in the world (plot-local (0,0,0), y = 0 is the plot surface)
	  ctx.parent    Instance that new parts are parented to (the item's Model)
	  ctx.colors    team palette: { Primary = Color3, Secondary = Color3, Trim = Color3 }
	  ctx.teamName  short upper-case name of the owner, e.g. "SAMXYZ"
	  ctx.config    the shared Config module (ctx.config.Layout, ctx.config.Colors)

	All positions/CFrames passed to these helpers are LOCAL to the plot.
	This module only uses Instance/CFrame/Vector3/Color3/Enum/UDim2 so it can also be run
	outside Roblox (tools/ uses it to render previews of the stadium).
]]

local BuildUtil = {}

local DEFAULT_COLOR = Color3.fromRGB(163, 162, 165)

function BuildUtil.NewContext(origin, parent, colors, teamName, config)
	return {
		origin = origin,
		parent = parent,
		colors = colors,
		teamName = teamName,
		config = config,
	}
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
	part.Parent = props.Parent or ctx.parent
	return part
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
