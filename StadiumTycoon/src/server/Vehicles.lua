--[[
	Vehicles
	Drivable golf carts. Buying a step of the "Golf Cart Garage" piece adds a cart:
	  step 2 -> cart #1, step 3 -> cart #2, step 4 -> cart #3
	Carts spawn on the parking pads in front of the garage (Config.Layout.CartPads).

	How driving works:
	  * a cart is one unanchored assembly (chassis + welded body parts) with a VehicleSeat
	  * a LinearVelocity (Plane mode, horizontal only) and an AngularVelocity (yaw only, keeps it
	    level) move it; gravity still works so it follows the ground
	  * when someone sits in the driver's seat the server gives that player network ownership and
	    the player's own client (Drive.client.lua) sets the velocities from the seat's throttle /
	    steer, so driving feels instant
	  * carts left far from their pad for a while (or that fall off the world) go back home
]]

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("TycoonShared")
local Config = require(Shared:WaitForChild("Config"))

local Vehicles = {}

local CART_TAG = "TycoonCart"
local MAX_SPEED = 46 -- studs per second
local TURN_RATE = 2.4 -- radians per second at full steer
local RETURN_AFTER = 45 -- seconds a cart may sit unused away from its pad
local RETURN_DISTANCE = 30
local FALL_Y = -40
local RIDE_HEIGHT = 1.2 -- chassis centre above its pad (the wheel balls rest on the 0.1 garage floor)

local carts = {} -- [plot] = { [cartIndex] = cartInfo }
local driveHooks = {} -- fn(player) when someone takes the wheel

local function weld(root, part)
	local w = Instance.new("WeldConstraint")
	w.Part0 = root
	w.Part1 = part
	w.Parent = part
end

local function makePart(model, root, props)
	local part = Instance.new(props.ClassName or "Part")
	part.Name = props.Name
	part.Size = props.Size
	part.CFrame = props.CFrame
	part.Color = props.Color
	part.Material = props.Material or Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.CanCollide = props.CanCollide == true
	part.Massless = props.Massless ~= false
	part.Anchored = false
	if props.Shape then
		part.Shape = props.Shape
	end
	if props.Transparency then
		part.Transparency = props.Transparency
	end
	part.Parent = model
	if root then
		weld(root, part)
	end
	return part
end

--[[
	Builds a golf cart model at world CFrame `at` (the cart faces at.LookVector).
	Returns the model. Exposed for the offline tests.
]]
function Vehicles.BuildCart(at, palette, number)
	local model = Instance.new("Model")
	model.Name = "GolfCart" .. tostring(number)

	-- chassis: carries the mass and the drive constraints. It doesn't collide itself: four
	-- invisible ball "wheels" do, so the cart rolls up kerbs, path edges and pads instead of
	-- snagging on them like a flat box would.
	local chassis = makePart(model, nil, {
		Name = "Chassis",
		Size = Vector3.new(5, 1, 9),
		CFrame = at * CFrame.new(0, RIDE_HEIGHT, 0),
		Color = palette.Primary,
		CanCollide = false,
		Massless = false,
	})
	chassis.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.05, 0, 1, 1)
	model.PrimaryPart = chassis

	local function rel(x, y, z)
		return chassis.CFrame * CFrame.new(x, y, z)
	end
	local white = palette.Trim or Color3.new(1, 1, 1)
	makePart(model, chassis, { Name = "Hood", Size = Vector3.new(4.8, 1.4, 2.2), CFrame = rel(0, 1.2, -3.3), Color = white })
	makePart(
		model,
		chassis,
		{ Name = "Bumper", Size = Vector3.new(5.2, 0.6, 0.5), CFrame = rel(0, 0.3, -4.7), Color = Color3.fromRGB(30, 30, 34) }
	)
	makePart(model, chassis, { Name = "RearDeck", Size = Vector3.new(4.8, 1, 2.4), CFrame = rel(0, 1, 3.2), Color = white })
	makePart(model, chassis, { Name = "Bag", Size = Vector3.new(1.4, 2.6, 1.4), CFrame = rel(1.2, 2.6, 3.6), Color = palette.Secondary })
	makePart(
		model,
		chassis,
		{ Name = "Dash", Size = Vector3.new(4.6, 1.2, 0.5), CFrame = rel(0, 1.6, -2), Color = Color3.fromRGB(35, 35, 40) }
	)
	makePart(model, chassis, {
		Name = "SteeringWheel",
		Size = Vector3.new(0.25, 1.3, 1.3),
		CFrame = rel(-1.1, 2.4, -1.4) * CFrame.Angles(0, math.rad(90), math.rad(-25)),
		Color = Color3.fromRGB(25, 25, 28),
		Shape = Enum.PartType.Cylinder,
	})
	-- roof on four posts
	for _, x in ipairs({ -2.2, 2.2 }) do
		for _, z in ipairs({ -1.6, 2.4 }) do
			makePart(
				model,
				chassis,
				{ Name = "RoofPost", Size = Vector3.new(0.3, 4.6, 0.3), CFrame = rel(x, 3.3, z), Color = Color3.fromRGB(200, 200, 205) }
			)
		end
	end
	makePart(model, chassis, { Name = "CartRoof", Size = Vector3.new(5.2, 0.3, 5.6), CFrame = rel(0, 5.7, 0.4), Color = palette.Primary })
	makePart(model, chassis, {
		Name = "Windshield",
		Size = Vector3.new(4.4, 2.6, 0.15),
		CFrame = rel(0, 4.1, -1.7) * CFrame.Angles(math.rad(-8), 0, 0),
		Color = Color3.fromRGB(170, 210, 235),
		Material = Enum.Material.Glass,
		Transparency = 0.55,
	})
	-- wheels: a visible tyre + an invisible collision ball (low friction: the drive constraints
	-- do the steering, the balls just roll/slide over the ground and climb small steps). Roblox
	-- averages two touching parts' friction by FrictionWeight, so the balls' weight of 100 keeps
	-- the contact slippery (about 0.06) on every ground material: with an even weight they would
	-- grip asphalt at about 0.43 and a loaded cart could not push itself up a 0.4 kerb.
	for _, x in ipairs({ -2.4, 2.4 }) do
		for _, z in ipairs({ -3, 3 }) do
			makePart(model, chassis, {
				Name = "Wheel",
				Size = Vector3.new(0.8, 1.9, 1.9),
				CFrame = rel(x, -0.15, z),
				Color = Color3.fromRGB(25, 25, 28),
				Shape = Enum.PartType.Cylinder,
			})
			local collider = makePart(model, chassis, {
				Name = "WheelCollider",
				Size = Vector3.new(1.9, 1.9, 1.9),
				CFrame = rel(x, -0.15, z),
				Color = Color3.fromRGB(25, 25, 28),
				Shape = Enum.PartType.Ball,
				Transparency = 1,
				CanCollide = true,
				Massless = false,
			})
			collider.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.05, 0, 100, 1)
		end
	end

	-- seats: driver (VehicleSeat) + a passenger bench
	local seat = makePart(model, chassis, {
		ClassName = "VehicleSeat",
		Name = "DriverSeat",
		Size = Vector3.new(2, 0.8, 2),
		CFrame = rel(-1.1, 1.1, 0.2),
		Color = Color3.fromRGB(40, 40, 46),
		CanCollide = true,
	})
	seat.MaxSpeed = 0 -- the drive controller moves the cart, not the seat
	seat.Torque = 0
	seat.HeadsUpDisplay = false
	makePart(model, chassis, {
		ClassName = "Seat",
		Name = "PassengerSeat",
		Size = Vector3.new(2, 0.8, 2),
		CFrame = rel(1.1, 1.1, 0.2),
		Color = Color3.fromRGB(40, 40, 46),
		CanCollide = true,
	})
	makePart(
		model,
		chassis,
		{ Name = "SeatBack", Size = Vector3.new(4.6, 1.8, 0.4), CFrame = rel(0, 2.2, 1.3), Color = Color3.fromRGB(40, 40, 46) }
	)
	-- number plate
	local plate = makePart(
		model,
		chassis,
		{ Name = "NumberPlate", Size = Vector3.new(2, 0.8, 0.1), CFrame = rel(0, 1.4, 4.45), Color = Color3.new(1, 1, 1) }
	)
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Back
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextColor3 = palette.Primary
	label.Text = "CART " .. tostring(number)
	label.Parent = gui
	gui.Parent = plate

	-- movement constraints (velocities are set by the driver's client)
	local attachment = Instance.new("Attachment")
	attachment.Name = "DriveAttachment"
	attachment.Parent = chassis
	local linear = Instance.new("LinearVelocity")
	linear.Name = "DriveVelocity"
	linear.Attachment0 = attachment
	linear.RelativeTo = Enum.ActuatorRelativeTo.World
	linear.VelocityConstraintMode = Enum.VelocityConstraintMode.Plane
	linear.PrimaryTangentAxis = Vector3.new(1, 0, 0)
	linear.SecondaryTangentAxis = Vector3.new(0, 0, 1)
	linear.PlaneVelocity = Vector2.new(0, 0)
	linear.MaxForce = 60000
	linear.Parent = chassis
	local angular = Instance.new("AngularVelocity")
	angular.Name = "DriveTurn"
	angular.Attachment0 = attachment
	angular.RelativeTo = Enum.ActuatorRelativeTo.World
	angular.AngularVelocity = Vector3.new(0, 0, 0)
	angular.MaxTorque = 1e7
	angular.Parent = chassis

	model:SetAttribute("MaxSpeed", MAX_SPEED)
	model:SetAttribute("TurnRate", TURN_RATE)
	CollectionService:AddTag(model, CART_TAG)
	return model
end

local function padCFrame(plot, index)
	local pad = Config.Layout.CartPads[index] -- (campus area coordinates)
	-- carts face -X (out of the garage, toward the HQ)
	return plot.Origin * CFrame.new(Config.Layout.Areas.campus + pad) * CFrame.Angles(0, math.rad(90), 0)
end

local function stopCart(info)
	local chassis = info.model.PrimaryPart
	if not chassis then
		return
	end
	local linear = chassis:FindFirstChild("DriveVelocity")
	local angular = chassis:FindFirstChild("DriveTurn")
	if linear then
		linear.PlaneVelocity = Vector2.new(0, 0)
	end
	if angular then
		angular.AngularVelocity = Vector3.new(0, 0, 0)
	end
end

local function sendHome(info)
	stopCart(info)
	-- the model's pivot is the chassis: put it back at its spawn height over the pad (not on the
	-- pad, which buries the wheels in the floor) and drop any speed it had (a falling cart)
	info.model:PivotTo(info.home * CFrame.new(0, RIDE_HEIGHT, 0))
	local chassis = info.model.PrimaryPart
	if chassis then
		chassis.AssemblyLinearVelocity = Vector3.new(0, 0, 0)
		chassis.AssemblyAngularVelocity = Vector3.new(0, 0, 0)
	end
	info.lastUsed = os.clock()
end

local function onOccupantChanged(info)
	local seat = info.seat
	local chassis = info.model.PrimaryPart
	local occupant = seat.Occupant
	info.lastUsed = os.clock()
	-- (a seat taken by something that isn't a player counts as empty)
	local player = occupant and Players:GetPlayerFromCharacter(occupant.Parent)
	if player then
		if chassis then
			pcall(function()
				chassis:SetNetworkOwner(player)
			end)
		end
		for _, hook in ipairs(driveHooks) do
			task.spawn(hook, player)
		end
	else
		stopCart(info)
		if chassis then
			pcall(function()
				chassis:SetNetworkOwner(nil)
			end)
		end
	end
end

local function spawnCart(plot, index)
	carts[plot] = carts[plot] or {}
	if carts[plot][index] or not Config.Layout.CartPads[index] then
		return
	end
	local folder = plot.Model:FindFirstChild("Carts")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Carts"
		folder.Parent = plot.Model
	end
	local home = padCFrame(plot, index)
	local model = Vehicles.BuildCart(home, plot.Palette, index)
	model.Parent = folder
	-- the server simulates parked carts (clients only get a cart while they drive it), so a
	-- nearby exploiter can't take a parked cart over and fling or delete it
	pcall(function()
		model.PrimaryPart:SetNetworkOwner(nil)
	end)
	local info = {
		model = model,
		seat = model:FindFirstChild("DriverSeat"),
		home = home,
		lastUsed = os.clock(),
	}
	carts[plot][index] = info
	info.seat:GetPropertyChangedSignal("Occupant"):Connect(function()
		onOccupantChanged(info)
	end)
end

local function removeCarts(plot)
	for _, info in pairs(carts[plot] or {}) do
		info.model:Destroy()
	end
	carts[plot] = nil
	local folder = plot.Model:FindFirstChild("Carts")
	if folder then
		folder:Destroy()
	end
end

-- Sends idle carts home and rescues carts that fell off the world. Returns how many moved.
function Vehicles.Tidy(now)
	local moved = 0
	local broken = {} -- carts that were destroyed or lost their chassis: rebuilt below
	for plot, list in pairs(carts) do
		for index, info in pairs(list) do
			-- (pcall: some tools error on reading a destroyed instance; Roblox just returns nil)
			local alive, chassis = pcall(function()
				local primary = info.model.PrimaryPart
				if info.model.Parent ~= nil and primary ~= nil and primary.Parent == info.model then
					return primary
				end
				return nil
			end)
			if not alive or not chassis then
				table.insert(broken, { plot = plot, index = index, info = info })
			else
				local position = chassis.CFrame.Position
				local occupant = info.seat and info.seat.Occupant
				local occupied = occupant ~= nil and occupant.Parent ~= nil
				if occupied then
					info.lastUsed = now
				end
				local farFromHome = (position - info.home.Position).Magnitude > RETURN_DISTANCE
				if position.Y < FALL_Y or (not occupied and farFromHome and now - info.lastUsed > RETURN_AFTER) then
					sendHome(info)
					moved += 1
				end
			end
		end
	end
	for _, entry in ipairs(broken) do
		pcall(function()
			entry.info.model:Destroy()
		end)
		carts[entry.plot][entry.index] = nil
		if entry.plot.Owner then
			spawnCart(entry.plot, entry.index)
			moved += 1
		end
	end
	return moved
end

function Vehicles.OnDrive(fn)
	table.insert(driveHooks, fn)
end

function Vehicles.GetCarts(plot)
	return carts[plot] or {}
end

-- Repaints a cart in a (new) team palette.
local PAINT = { Chassis = "Primary", CartRoof = "Primary", Bag = "Secondary", Hood = "Trim", RearDeck = "Trim" }
function Vehicles.Recolor(model, palette)
	for _, descendant in ipairs(model:GetDescendants()) do
		local role = descendant:IsA("BasePart") and PAINT[descendant.Name]
		if role then
			descendant.Color = palette[role] or Color3.new(1, 1, 1)
		elseif descendant:IsA("TextLabel") then
			descendant.TextColor3 = palette.Primary
		end
	end
end

function Vehicles.Init(plotManager)
	plotManager.OnPieceBuilt("golf_carts", function(plot, item)
		if item.Stage >= 2 then
			spawnCart(plot, item.Stage - 1)
		end
	end)
	plotManager.OnPlotReleased(removeCarts)
	plotManager.OnTeamApplied(function(plot)
		for _, info in pairs(carts[plot] or {}) do
			Vehicles.Recolor(info.model, plot.Palette)
		end
	end)
	task.spawn(function()
		while true do
			task.wait(5)
			Vehicles.Tidy(os.clock())
		end
	end)
end

Vehicles.Tag = CART_TAG

return Vehicles
