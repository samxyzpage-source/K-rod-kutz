--[[
	Staff
	Hired staff appear as characters (one per step):
	  staff_coaches  - coordinators in team polos with headsets and clipboards (practice field)
	  staff_trainers - trainers / doctor in white with medical gear (practice field)
	  staff_vendors  - food vendors with their carts (stadium plaza)
	Coaches and trainers raise the team rating (Franchise.lua); vendors add income.
]]

local BuildUtil = require(script.Parent.Parent.BuildUtil)

local Staff = {}

local SKIN = {
	Color3.fromRGB(255, 220, 177),
	Color3.fromRGB(198, 134, 66),
	Color3.fromRGB(141, 85, 36),
	Color3.fromRGB(234, 192, 134),
	Color3.fromRGB(95, 60, 30),
}
local PANTS = Color3.fromRGB(45, 48, 60)
local WHITE = Color3.fromRGB(245, 245, 245)
local BLACK = Color3.fromRGB(25, 25, 30)

-- A blocky person standing at `feet` (local Vector3) facing local -Z (toward the road / HQ).
-- Returns the torso (for name tags) and a CFrame helper relative to the figure.
local function person(ctx, feet, shirt, skin, name)
	local base = CFrame.new(feet) * CFrame.Angles(0, math.pi, 0) -- face -Z
	local function at(x, y, z)
		return base * CFrame.new(x, y, z)
	end
	local props = { CanCollide = false, CastShadow = true }
	for _, side in ipairs({ -0.5, 0.5 }) do
		BuildUtil.Part(
			ctx,
			{ Name = "Leg", Size = Vector3.new(0.95, 2.4, 1), CFrame = at(side, 1.2, 0), Color = PANTS, CanCollide = false }
		)
		BuildUtil.Part(
			ctx,
			{ Name = "Arm", Size = Vector3.new(0.9, 2.2, 1), CFrame = at(side * 3, 3.5, 0), Color = shirt, CanCollide = false }
		)
		BuildUtil.Part(
			ctx,
			{ Name = "Hand", Size = Vector3.new(0.8, 0.5, 0.8), CFrame = at(side * 3, 2.2, 0), Color = skin, CanCollide = false }
		)
	end
	local torso = BuildUtil.Part(
		ctx,
		{ Name = "Torso", Size = Vector3.new(2.1, 2.4, 1.1), CFrame = at(0, 3.6, 0), Color = shirt, CanCollide = false }
	)
	BuildUtil.Part(ctx, { Name = "Head", Size = Vector3.new(1.3, 1.3, 1.3), CFrame = at(0, 5.5, 0), Color = skin, CanCollide = false })
	BuildUtil.Part(
		ctx,
		{ Name = "Eyes", Size = Vector3.new(0.8, 0.15, 0.05), CFrame = at(0, 5.65, 0.66), Color = BLACK, CanCollide = false }
	)
	BuildUtil.Billboard(torso, name, {
		LabelName = "StaffName",
		Size = UDim2.new(8, 0, 1.4, 0),
		StudsOffset = Vector3.new(0, 4, 0),
		TextColor3 = Color3.fromRGB(255, 230, 120),
		MaxDistance = 70,
	})
	return torso, at, props
end

local function cap(ctx, at, color)
	BuildUtil.Part(ctx, { Name = "Cap", Size = Vector3.new(1.4, 0.45, 1.4), CFrame = at(0, 6.3, 0), Color = color, CanCollide = false })
	BuildUtil.Part(
		ctx,
		{ Name = "CapBrim", Size = Vector3.new(1.2, 0.12, 0.7), CFrame = at(0, 6.12, 0.95), Color = color, CanCollide = false }
	)
end

local function headset(ctx, at)
	BuildUtil.Part(
		ctx,
		{ Name = "Headset", Size = Vector3.new(1.5, 0.2, 0.25), CFrame = at(0, 6.25, 0), Color = BLACK, CanCollide = false }
	)
	for _, side in ipairs({ -0.72, 0.72 }) do
		BuildUtil.Part(
			ctx,
			{ Name = "EarCup", Size = Vector3.new(0.25, 0.6, 0.6), CFrame = at(side, 5.6, 0), Color = BLACK, CanCollide = false }
		)
	end
	BuildUtil.Part(
		ctx,
		{ Name = "Mic", Size = Vector3.new(0.12, 0.12, 0.7), CFrame = at(-0.6, 5.3, 0.4), Color = BLACK, CanCollide = false }
	)
end

local function clipboard(ctx, at)
	BuildUtil.Part(ctx, {
		Name = "Clipboard",
		Size = Vector3.new(1.2, 1.5, 0.12),
		CFrame = at(1.5, 3, 0.7) * CFrame.Angles(math.rad(-25), 0, 0),
		Color = Color3.fromRGB(150, 105, 60),
		CanCollide = false,
	})
	BuildUtil.Part(ctx, {
		Name = "Paper",
		Size = Vector3.new(1, 1.2, 0.05),
		CFrame = at(1.5, 3, 0.79) * CFrame.Angles(math.rad(-25), 0, 0),
		Color = WHITE,
		CanCollide = false,
	})
end

-- The role sign stands on the ground in front of the figure's feet (its text faces the road, and
-- nothing of the figure stands in front of it).
local function sign(ctx, at, text, color)
	local post = BuildUtil.Part(
		ctx,
		{ Name = "RoleSign", Size = Vector3.new(4.4, 1.1, 0.2), CFrame = at(0, 0.9, 1.6), Color = color, CanCollide = false }
	)
	BuildUtil.SurfaceText(post, Enum.NormalId.Back, text, { LabelName = "RoleText", TextColor3 = WHITE, PixelsPerStud = 30 })
end

---------------------------------------------------------------------------------------------
-- Coaching staff
---------------------------------------------------------------------------------------------
-- What the staff say when you look at them (fictional people, fun facts)
local COACH_INFO = {
	"Calls the plays on offense. Says the best play is the one the defense isn't ready for.",
	"Runs the defense. Has watched so much film he dreams in X's and O's.",
	"Coaches the kickers, punters and returners. Ask him about the 55-yard kick spot on your field!",
}
local TRAINER_INFO = {
	"Tapes ankles, checks injuries and keeps the players on the field. Better staff = a higher team rating.",
	"Runs the weight room. Lift weights in your HQ to make him proud.",
	"Checks every player before game day. The red cross on his shirt means business.",
}
local COACHES = {
	{ Title = "OFFENSIVE COORDINATOR", Short = "OFFENSE" },
	{ Title = "DEFENSIVE COORDINATOR", Short = "DEFENSE" },
	{ Title = "SPECIAL TEAMS COACH", Short = "SPECIAL TEAMS" },
}

function Staff.staff_coaches(ctx)
	local spots = ctx.config.Layout.StaffSpots.staff_coaches
	for index, info in ipairs(COACHES) do
		BuildUtil.Stage(ctx, index)
		local torso, at = person(ctx, spots[index], ctx.colors.Primary, SKIN[(index % #SKIN) + 1], info.Title)
		BuildUtil.Look(torso, info.Title, COACH_INFO[index] .. " Each coach adds +3 to your team rating.", {
			Action = "Talk",
			LookKey = "rating",
		})
		cap(ctx, at, ctx.colors.Secondary)
		headset(ctx, at)
		clipboard(ctx, at)
		BuildUtil.Part(ctx, {
			Name = "Whistle",
			Size = Vector3.new(0.3, 0.3, 0.3),
			CFrame = at(0, 4.4, 0.6),
			Color = Color3.fromRGB(200, 200, 205),
			CanCollide = false,
			Shape = Enum.PartType.Ball,
		})
		sign(ctx, at, info.Short, ctx.colors.Primary)
	end
end

---------------------------------------------------------------------------------------------
-- Medical & training staff
---------------------------------------------------------------------------------------------
local TRAINERS = { "HEAD TRAINER", "STRENGTH COACH", "TEAM DOCTOR" }

function Staff.staff_trainers(ctx)
	local spots = ctx.config.Layout.StaffSpots.staff_trainers
	for index, title in ipairs(TRAINERS) do
		BuildUtil.Stage(ctx, index)
		local shirt = index == 2 and ctx.colors.Secondary or WHITE
		local torso, at = person(ctx, spots[index], shirt, SKIN[((index + 2) % #SKIN) + 1], title)
		BuildUtil.Look(torso, title, TRAINER_INFO[index] .. " Each one adds +2 to your team rating.", {
			Action = "Talk",
			LookKey = "rating",
		})
		if index == 1 then
			-- trainer: fanny pack + tape roll
			BuildUtil.Part(
				ctx,
				{ Name = "FannyPack", Size = Vector3.new(1.8, 0.6, 0.5), CFrame = at(0, 2.5, 0.75), Color = BLACK, CanCollide = false }
			)
			BuildUtil.Cylinder(ctx, {
				Name = "TapeRoll",
				Position = (at(1.5, 2, 0.6)).Position,
				Height = 0.4,
				Diameter = 0.7,
				Axis = "Z",
				Color = WHITE,
				CanCollide = false,
			})
		elseif index == 2 then
			-- strength coach: stopwatch + kettlebell (on the ground beside the role sign, not behind it)
			cap(ctx, at, BLACK)
			BuildUtil.Ball(
				ctx,
				{ Name = "Kettlebell", Position = (at(2.9, 0.6, 0.8)).Position, Diameter = 1.1, Color = BLACK, CanCollide = false }
			)
			BuildUtil.Part(ctx, {
				Name = "Stopwatch",
				Size = Vector3.new(0.5, 0.5, 0.15),
				CFrame = at(-1.5, 2.3, 0.6),
				Color = Color3.fromRGB(230, 70, 70),
				CanCollide = false,
			})
		else
			-- doctor: red cross + medical bag + stethoscope
			BuildUtil.Part(ctx, {
				Name = "CrossV",
				Size = Vector3.new(0.25, 0.8, 0.05),
				CFrame = at(0.5, 4.1, 0.58),
				Color = Color3.fromRGB(220, 40, 40),
				CanCollide = false,
			})
			BuildUtil.Part(ctx, {
				Name = "CrossH",
				Size = Vector3.new(0.8, 0.25, 0.05),
				CFrame = at(0.5, 4.1, 0.58),
				Color = Color3.fromRGB(220, 40, 40),
				CanCollide = false,
			})
			BuildUtil.Part(
				ctx,
				{ Name = "Stethoscope", Size = Vector3.new(1.4, 0.15, 0.1), CFrame = at(0, 4.7, 0.6), Color = BLACK, CanCollide = false }
			)
			BuildUtil.Part(ctx, {
				Name = "MedBag",
				Size = Vector3.new(1.6, 1.1, 0.8),
				CFrame = at(1.9, 1.8, 0.2),
				Color = Color3.fromRGB(150, 30, 30),
				CanCollide = false,
			})
		end
		sign(ctx, at, title == "TEAM DOCTOR" and "MEDICAL" or "TRAINING", Color3.fromRGB(190, 40, 40))
	end
end

---------------------------------------------------------------------------------------------
-- Food vendors (with carts)
---------------------------------------------------------------------------------------------
local VENDORS = {
	{ Title = "HOT DOG VENDOR", Food = "HOT DOGS", Color = Color3.fromRGB(220, 60, 40), Use = "hotdog" },
	{ Title = "POPCORN VENDOR", Food = "POPCORN", Color = Color3.fromRGB(240, 200, 40), Use = "popcorn" },
	{ Title = "DRINKS VENDOR", Food = "COLD DRINKS", Color = Color3.fromRGB(40, 140, 220), Use = "soda" },
}

function Staff.staff_vendors(ctx)
	local spots = ctx.config.Layout.StaffSpots.staff_vendors
	for index, info in ipairs(VENDORS) do
		BuildUtil.Stage(ctx, index)
		local feet = spots[index]
		local torso, at = person(ctx, feet + Vector3.new(2.6, 0, 0), WHITE, SKIN[((index + 1) % #SKIN) + 1], info.Title)
		BuildUtil.Use(ctx, torso, info.Use, { Object = info.Title, Distance = 8 })
		cap(ctx, at, info.Color)
		-- apron stripe
		BuildUtil.Part(
			ctx,
			{ Name = "Apron", Size = Vector3.new(1.9, 1.6, 0.1), CFrame = at(0, 3.2, 0.6), Color = info.Color, CanCollide = false }
		)
		-- the cart, to the vendor's left (local -X)
		local cartX = feet.X - 1.4
		BuildUtil.Block(
			ctx,
			"CartBody",
			Vector3.new(3, 2.6, 4.2),
			Vector3.new(cartX, 0, feet.Z),
			info.Color,
			Enum.Material.SmoothPlastic,
			{ CanCollide = false },
			0.9
		)
		BuildUtil.Block(
			ctx,
			"CartTop",
			Vector3.new(3.2, 0.3, 4.4),
			Vector3.new(cartX, 0, feet.Z),
			Color3.fromRGB(200, 200, 205),
			Enum.Material.Metal,
			{ CanCollide = false },
			3.5
		)
		for _, z in ipairs({ -1.5, 1.5 }) do
			BuildUtil.Cylinder(ctx, {
				Name = "CartWheel",
				Position = Vector3.new(cartX - 1.6, 0.6, feet.Z + z),
				Height = 0.3,
				Diameter = 1.2,
				Axis = "X",
				Color = BLACK,
				CanCollide = false,
			})
		end
		BuildUtil.Part(ctx, {
			Name = "UmbrellaPole",
			Size = Vector3.new(0.2, 4.5, 0.2),
			Position = Vector3.new(cartX, 6, feet.Z),
			Color = WHITE,
			CanCollide = false,
		})
		BuildUtil.Cylinder(ctx, {
			Name = "Umbrella",
			Position = Vector3.new(cartX, 8.3, feet.Z),
			Height = 0.4,
			Diameter = 6,
			Axis = "Y",
			Color = info.Color,
			CanCollide = false,
		})
		local board = BuildUtil.Part(ctx, {
			Name = "FoodSign",
			Size = Vector3.new(0.15, 1.2, 3.8),
			Position = Vector3.new(cartX - 1.6, 2.6, feet.Z),
			Color = WHITE,
			CanCollide = false,
		})
		BuildUtil.SurfaceText(board, Enum.NormalId.Left, info.Food, { LabelName = "FoodText", TextColor3 = info.Color, PixelsPerStud = 30 })
	end
end

return Staff
