--[[
	Drive
	Drives a golf cart (models tagged "TycoonCart", see server Vehicles.lua) while the local
	player sits in its VehicleSeat. WASD / arrow keys / the mobile thumbstick set the seat's
	ThrottleFloat and SteerFloat; this script turns them into the cart's velocities. The server
	gives the driver network ownership of the cart, so these local changes move it instantly.
]]

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer

local CART_TAG = "TycoonCart"
local ACCELERATION = 2.2 -- how quickly the cart reaches its target speed (per second)
local BRAKING = 4

local speed = 0
local drivenLinear, drivenAngular = nil, nil -- the drive constraints of the cart driven last frame

-- Stops the cart we were driving (its driver got out, or jumped into another cart). This client
-- keeps owning it until the server takes it back, so it would roll on at its last speed until then.
local function stopDriven()
	if drivenLinear then
		drivenLinear.PlaneVelocity = Vector2.new(0, 0)
		drivenAngular.AngularVelocity = Vector3.new(0, 0, 0)
	end
	drivenLinear, drivenAngular = nil, nil
end

-- The cart the local player is driving right now (or nil).
local function currentCart()
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local seat = humanoid and humanoid.SeatPart
	if not seat or not seat:IsA("VehicleSeat") then
		return nil
	end
	local model = seat.Parent
	if not model or not CollectionService:HasTag(model, CART_TAG) then
		return nil
	end
	return model, seat
end

local function drive(dt)
	local model, seat = currentCart()
	if not model then
		speed = 0
		stopDriven()
		return
	end
	local chassis = model.PrimaryPart
	local linear = chassis and chassis:FindFirstChild("DriveVelocity")
	local angular = chassis and chassis:FindFirstChild("DriveTurn")
	if not linear or not angular then
		return
	end
	if drivenLinear ~= linear then
		stopDriven()
		speed = 0
		drivenLinear, drivenAngular = linear, angular
	end

	local maxSpeed = model:GetAttribute("MaxSpeed") or 40
	local turnRate = model:GetAttribute("TurnRate") or 2
	local throttle = seat.ThrottleFloat
	local steer = seat.SteerFloat

	-- reversing is slower than driving forward
	local target = throttle >= 0 and throttle * maxSpeed or throttle * maxSpeed * 0.5
	local rate = (math.abs(target) < math.abs(speed)) and BRAKING or ACCELERATION
	speed += (target - speed) * math.min(1, dt * rate)
	if math.abs(speed) < 0.05 and throttle == 0 then
		speed = 0
	end

	local look = chassis.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	if flat.Magnitude > 0.01 then
		flat = flat.Unit
	end
	linear.PlaneVelocity = Vector2.new(flat.X * speed, flat.Z * speed)

	-- steering only works while moving (and flips when reversing, like a real cart)
	local grip = math.clamp(speed / (maxSpeed * 0.35), -1, 1)
	angular.AngularVelocity = Vector3.new(0, -steer * turnRate * grip, 0)
end

RunService.Heartbeat:Connect(function(dt)
	local ok, err = pcall(drive, dt)
	if not ok then
		warn("[Drive] " .. tostring(err))
	end
end)
