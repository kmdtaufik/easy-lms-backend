import "dotenv/config";
import cors from "cors";
import express from "express";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import mongoose, { Schema, model } from "mongoose";
import { admin, emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import slugify from "slugify";
import "zod/mini";
import z from "zod";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { v4 } from "uuid";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import ip from "@arcjet/ip";
import arcjet, { detectBot, fixedWindow, protectSignup, shield, slidingWindow } from "@arcjet/node";

//#region src/db/index.ts
await mongoose.connect(process.env.DATABASE_URL || "").catch((error) => {
	console.log("Error connecting to database:", error);
});
const client = mongoose.connection.getClient().db("myDB");

//#endregion
//#region src/lib/auth.ts
const resend = new Resend(process.env.RESEND_API_KEY);
const auth = betterAuth({
	database: mongodbAdapter(client),
	telemetry: { enabled: false },
	trustedOrigins: [process.env.CORS_ORIGIN],
	emailAndPassword: { enabled: true },
	socialProviders: { google: {
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET
	} },
	plugins: [emailOTP({ async sendVerificationOTP({ email, otp, type }) {
		const { data, error } = await resend.emails.send({
			from: "Easy LMS <onboarding@resend.dev>",
			to: [email],
			subject: "Easy LMS - Email Verification",
			html: `Your verification code is: <strong>${otp}</strong> <br>This code is valid for 3 minutes.`
		});
	} }), admin()]
});

//#endregion
//#region src/db/models/course.model.ts
const { Schema: Schema$3, model: model$3 } = mongoose;
const courseSchema = new Schema$3({
	title: {
		type: String,
		required: [true, "Title is required"],
		trim: true,
		maxlength: [200, "Title cannot exceed 200 characters"]
	},
	fileKey: {
		type: String,
		required: [true, "File key is required"],
		trim: true
	},
	price: {
		type: Number,
		required: [true, "Price is required"],
		min: [0, "Price cannot be negative"]
	},
	description: {
		type: String,
		required: [true, "Description is required"],
		trim: true,
		minlength: [10, "Description must be at least 10 characters"]
	},
	duration: {
		type: Number,
		required: [true, "Duration is required"],
		min: [0, "Duration cannot be negative"]
	},
	level: {
		type: String,
		required: [true, "Level is required"],
		enum: [
			"Beginner",
			"Intermediate",
			"Advanced"
		],
		default: "Beginner"
	},
	category: {
		type: String,
		required: [true, "Category is required"],
		trim: true
	},
	smallDescription: {
		type: String,
		required: [true, "Small description is required"],
		trim: true,
		maxlength: [500, "Small description cannot exceed 500 characters"]
	},
	slug: {
		type: String,
		required: [true, "Slug is required"],
		unique: true,
		trim: true,
		lowercase: true,
		match: [/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"]
	},
	status: {
		type: String,
		required: [true, "Status is required"],
		enum: [
			"Draft",
			"Published",
			"Archived"
		],
		default: "Draft"
	},
	createdBy: {
		type: Schema$3.Types.ObjectId,
		ref: "User",
		required: true
	},
	chapters: [{
		type: mongoose.Schema.Types.ObjectId,
		ref: "Chapter"
	}],
	enrollments: [{
		type: Schema$3.Types.ObjectId,
		ref: "Enrollment"
	}]
}, {
	collection: "courses",
	timestamps: true,
	toJSON: { virtuals: true },
	toObject: { virtuals: true }
});
courseSchema.index({
	category: 1,
	status: 1
});
courseSchema.index({ createdBy: 1 });
courseSchema.index({ createdAt: -1 });
courseSchema.pre("save", function(next) {
	if (this.isModified() && !this.isNew) this.updatedAt = /* @__PURE__ */ new Date();
	next();
});
courseSchema.virtual("formattedPrice").get(function() {
	if (!this.price) return "$0.00";
	return `$${this.price.toFixed(2)}`;
});
courseSchema.virtual("formattedDuration").get(function() {
	const hours = Math.floor(this.duration);
	const minutes = Math.round((this.duration - hours) * 60);
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
});
courseSchema.pre("findOneAndDelete", async function(next) {
	const courseId = this.getQuery()._id;
	if (!courseId) return next();
	const Chapter$1 = mongoose.model("Chapter");
	const Lesson$1 = mongoose.model("Lesson");
	const chapters = await Chapter$1.find({ course: courseId }).select("_id");
	await Lesson$1.deleteMany({ chapter: { $in: chapters.map((c) => c._id) } });
	await Chapter$1.deleteMany({ course: courseId });
	next();
});
courseSchema.pre("deleteOne", {
	document: true,
	query: false
}, async function(next) {
	const courseId = this._id;
	if (!courseId) return next();
	const Chapter$1 = mongoose.model("Chapter");
	const Lesson$1 = mongoose.model("Lesson");
	const chapters = await Chapter$1.find({ course: courseId }).select("_id");
	await Lesson$1.deleteMany({ chapter: { $in: chapters.map((c) => c._id) } });
	await Chapter$1.deleteMany({ course: courseId });
	next();
});
const Course = model$3("Course", courseSchema);

//#endregion
//#region src/db/models/auth.model.ts
const { Schema: Schema$2, model: model$2 } = mongoose;
const userSchema = new Schema$2({
	name: {
		type: String,
		required: true
	},
	email: {
		type: String,
		required: true,
		unique: true
	},
	emailVerified: {
		type: Boolean,
		required: true
	},
	image: { type: String },
	role: {
		type: String,
		enum: ["user", "admin"],
		default: "user"
	},
	banned: {
		type: Boolean,
		default: false
	},
	banReason: {
		type: String,
		default: null
	},
	banExpires: {
		type: Date,
		default: null
	},
	createdAt: {
		type: Date,
		required: true
	},
	updatedAt: {
		type: Date,
		required: true
	},
	enrollments: [{
		type: Schema$2.Types.ObjectId,
		ref: "Enrollment"
	}],
	lessonProgress: [{
		type: Schema$2.Types.ObjectId,
		ref: "LessonProgress"
	}],
	stripeCustomerId: {
		type: String,
		unique: true
	}
}, { collection: "user" });
const sessionSchema = new Schema$2({
	_id: { type: String },
	expiresAt: {
		type: Date,
		required: true
	},
	token: {
		type: String,
		required: true,
		unique: true
	},
	createdAt: {
		type: Date,
		required: true
	},
	updatedAt: {
		type: Date,
		required: true
	},
	ipAddress: { type: String },
	userAgent: { type: String },
	userId: {
		type: String,
		ref: "User",
		required: true
	},
	impersonatedBy: {
		type: String,
		ref: "User",
		default: null
	}
}, { collection: "session" });
const accountSchema = new Schema$2({
	_id: { type: String },
	accountId: {
		type: String,
		required: true
	},
	providerId: {
		type: String,
		required: true
	},
	userId: {
		type: String,
		ref: "User",
		required: true
	},
	accessToken: { type: String },
	refreshToken: { type: String },
	idToken: { type: String },
	accessTokenExpiresAt: { type: Date },
	refreshTokenExpiresAt: { type: Date },
	scope: { type: String },
	password: { type: String },
	createdAt: {
		type: Date,
		required: true
	},
	updatedAt: {
		type: Date,
		required: true
	}
}, { collection: "account" });
const verificationSchema = new Schema$2({
	_id: { type: String },
	identifier: {
		type: String,
		required: true
	},
	value: {
		type: String,
		required: true
	},
	expiresAt: {
		type: Date,
		required: true
	},
	createdAt: { type: Date },
	updatedAt: { type: Date }
}, { collection: "verification" });
const rateLimitSchema = new Schema$2({
	_id: {
		type: String,
		required: true
	},
	key: {
		type: String,
		required: true,
		unique: true
	},
	count: {
		type: Number,
		required: true,
		default: 0
	},
	lastRequest: {
		type: Number,
		required: true
	}
}, { collection: "rateLimit" });
const User = model$2("User", userSchema);
const Session = model$2("Session", sessionSchema);
const Account = model$2("Account", accountSchema);
const Verification = model$2("Verification", verificationSchema);
const RateLimit = model$2("RateLimit", rateLimitSchema);

//#endregion
//#region src/db/models/chapter.model.ts
const chapterSchema = new Schema({
	title: {
		type: String,
		required: true,
		trim: true,
		maxlength: 200
	},
	position: {
		type: Number,
		required: true,
		min: 1
	},
	course: {
		type: Schema.Types.ObjectId,
		ref: "Course",
		required: true
	},
	lessons: [{
		type: Schema.Types.ObjectId,
		ref: "Lesson"
	}]
}, {
	timestamps: true,
	collection: "chapters"
});
chapterSchema.index({ course: 1 });
chapterSchema.index({ createdAt: -1 });
chapterSchema.pre("findOneAndDelete", async function(next) {
	const query = this.getQuery();
	const doc = await this.model.findOne(query).select("_id course");
	if (!doc) return next();
	const Lesson$1 = mongoose.model("Lesson");
	await Lesson$1.deleteMany({ chapter: doc._id });
	await mongoose.model("Course").updateOne({ _id: doc.course }, { $pull: { chapters: doc._id } });
	next();
});
chapterSchema.pre("deleteOne", {
	document: true,
	query: false
}, async function(next) {
	const chapterId = this._id;
	const courseId = this.course;
	const Lesson$1 = mongoose.model("Lesson");
	await Lesson$1.deleteMany({ chapter: chapterId });
	await mongoose.model("Course").updateOne({ _id: courseId }, { $pull: { chapters: chapterId } });
	next();
});
const Chapter = model("Chapter", chapterSchema);

//#endregion
//#region src/db/models/lesson.model.ts
const lessonSchema = new Schema({
	position: {
		type: Number,
		default: 0,
		required: true
	},
	title: {
		type: String,
		required: true,
		trim: true,
		maxlength: 200
	},
	description: {
		type: String,
		trim: true
	},
	thumbnailKey: {
		type: String,
		trim: true
	},
	videoKey: {
		type: String,
		trim: true
	},
	chapter: {
		type: Schema.Types.ObjectId,
		ref: "Chapter",
		required: true
	},
	lessonProgress: [{
		type: Schema.Types.ObjectId,
		ref: "LessonProgress"
	}]
}, {
	timestamps: true,
	collection: "lessons"
});
lessonSchema.index({
	chapter: 1,
	createdAt: -1
});
lessonSchema.pre("findOneAndDelete", async function(next) {
	const doc = await this.model.findOne(this.getQuery()).select("_id chapter");
	if (!doc) return next();
	await mongoose.model("Chapter").updateOne({ _id: doc.chapter }, { $pull: { lessons: doc._id } });
	await mongoose.model("LessonProgress").deleteMany({ lesson: doc._id });
	next();
});
lessonSchema.pre("deleteOne", {
	document: true,
	query: false
}, async function(next) {
	const lessonId = this._id;
	const chapterId = this.chapter;
	await mongoose.model("Chapter").updateOne({ _id: chapterId }, { $pull: { lessons: lessonId } });
	await mongoose.model("LessonProgress").deleteMany({ lesson: lessonId });
	next();
});
const lessonProgressSchema = new Schema({
	completed: {
		type: Boolean,
		default: false
	},
	user: {
		type: Schema.Types.ObjectId,
		ref: "User",
		required: true
	},
	lesson: {
		type: Schema.Types.ObjectId,
		ref: "Lesson",
		required: true
	}
}, {
	timestamps: true,
	collection: "lessonProgress"
});
lessonProgressSchema.pre("findOneAndDelete", async function(next) {
	const doc = await this.model.findOne(this.getQuery()).select("_id lesson user");
	if (!doc) return next();
	await mongoose.model("Lesson").updateOne({ _id: doc.lesson }, { $pull: { lessonProgress: doc._id } });
	await mongoose.model("User").updateOne({ _id: doc.user }, { $pull: { lessonProgress: doc._id } });
	next();
});
const LessonProgress = model("LessonProgress", lessonProgressSchema);
const Lesson = model("Lesson", lessonSchema);

//#endregion
//#region src/lib/s3Client.ts
const s3 = new S3Client({
	region: "auto",
	endpoint: process.env.AWS_ENDPOING_URL_S3,
	forcePathStyle: false
});

//#endregion
//#region src/services/s3.ts
const fileUploadSchema = z.object({
	fileName: z.string().min(1, { message: "File naem missing" }),
	contentType: z.string().min(1, { message: "Content type missing" }),
	size: z.number().min(1, { message: "File size missing" }),
	isImage: z.boolean()
});
const fileUpload = async (req, res) => {
	try {
		const data = req.body;
		if (process.env.NODE_ENV !== "production") console.log("File upload request data:", data);
		const validation = fileUploadSchema.safeParse(data);
		if (!validation.success) {
			if (process.env.NODE_ENV !== "production") console.log("File upload validation:", validation);
			return res.status(400).json({
				success: false,
				message: "Validation error"
			});
		}
		const { fileName, contentType, size } = validation.data;
		const uniqueKey = `${v4()}-${slugify(fileName)}`;
		const command = new PutObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME_S3,
			ContentType: contentType,
			ContentLength: size,
			Key: uniqueKey
		});
		const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 360 });
		if (process.env.NODE_ENV !== "production") console.log("Presigned URL generated:", presignedUrl);
		const response = {
			presignedUrl,
			key: uniqueKey
		};
		return res.status(200).json(response);
	} catch (e) {
		if (process.env.NODE_ENV === "development") console.log(e);
		return res.status(500).json({
			success: false,
			message: "Server error"
		});
	}
};
const deleteFile = async (req, res) => {
	try {
		const data = req.body;
		if (process.env.NODE_ENV !== "production") console.log("File delete request data:", data);
		const { key } = data;
		if (!key || typeof key !== "string") return res.status(400).json({
			success: false,
			message: "File key missing or invalid"
		});
		const deleteCommand = new DeleteObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME_S3,
			Key: key
		});
		await s3.send(deleteCommand);
		if (process.env.NODE_ENV !== "production") console.log("File deleted:", key);
		return res.status(200).json({
			success: true,
			message: "File deleted successfully"
		});
	} catch (e) {
		if (process.env.NODE_ENV === "development") console.log(e);
		return res.status(500).json({
			success: false,
			message: "Server error"
		});
	}
};
async function s3FileDelete(key) {
	try {
		const deleteCommand = new DeleteObjectCommand({
			Bucket: process.env.AWS_BUCKET_NAME_S3,
			Key: key
		});
		await s3.send(deleteCommand);
	} catch (e) {
		console.error(e);
	}
}

//#endregion
//#region src/db/models/enrollment.model.ts
const { Schema: Schema$1, model: model$1 } = mongoose;
const enrollmentSchema = new Schema$1({
	user: {
		type: Schema$1.Types.ObjectId,
		ref: "User",
		required: true
	},
	course: {
		type: Schema$1.Types.ObjectId,
		ref: "Course",
		required: true
	},
	amount: {
		type: Number,
		required: true
	},
	status: {
		type: String,
		enum: [
			"pending",
			"active",
			"cancelled"
		],
		default: "pending"
	}
}, {
	timestamps: true,
	collection: "enrollments"
});
enrollmentSchema.index({
	user: 1,
	course: 1
}, { unique: true });
const Enrollment = model$1("Enrollment", enrollmentSchema);

//#endregion
//#region src/db/controllers/course.controllers.ts
var CourseController = class {
	static async create(req, res) {
		try {
			const { title, fileKey, price, description, duration, level, category, smallDescription, slug, status, createdBy } = req.body;
			if (!title || !fileKey || !description || !smallDescription || !createdBy) return res.status(400).json({
				message: "Missing required fields",
				required: [
					"title",
					"fileKey",
					"description",
					"smallDescription",
					"createdBy"
				]
			});
			if (price < 0 || duration < 0) return res.status(400).json({ message: "Price and duration must be positive numbers" });
			let finalSlug = slug ? slugify(slug, {
				lower: true,
				strict: true
			}) : slugify(title, {
				lower: true,
				strict: true
			});
			const existing = await Course.findOne({ slug: finalSlug });
			if (existing) finalSlug = `${finalSlug}-${Date.now()}`;
			const course = new Course({
				title,
				fileKey,
				price: Number(price),
				description,
				duration: Number(duration),
				level,
				category,
				smallDescription,
				slug: finalSlug,
				status,
				createdBy
			});
			const saved = await course.save();
			const populated = await saved.populate("createdBy", "name email role");
			res.status(201).json({
				message: "Course created successfully",
				data: populated
			});
		} catch (error) {
			if (process.env.NODE_ENV !== "production") console.error(error);
			if (error.name === "ValidationError") {
				const errors = Object.values(error.errors).map((err) => err.message);
				return res.status(400).json({
					message: "Validation failed",
					errors
				});
			}
			if (error.code === 11e3) return res.status(400).json({ message: "Course with this slug already exists" });
			res.status(500).json({ message: "Failed to create course" });
		}
	}
	static async getAll(req, res) {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
		try {
			const page = parseInt(req.query.page) || 1;
			const limit = parseInt(req.query.limit) || 9;
			const skip = (page - 1) * limit;
			const search = req.query.search;
			const filter = {};
			if (!session || session?.user?.role !== "admin") filter.status = "Published";
			else if (req.query.status) filter.status = req.query.status;
			if (req.query.category) filter.category = req.query.category;
			if (req.query.level) filter.level = req.query.level;
			if (search && search.trim()) {
				const searchRegex = new RegExp(search.trim(), "i");
				filter.$or = [
					{ title: searchRegex },
					{ description: searchRegex },
					{ smallDescription: searchRegex },
					{ category: searchRegex },
					{ level: searchRegex }
				];
			}
			const courses = await Course.find(filter).populate("createdBy", "name email role").sort({ createdAt: -1 }).skip(skip).limit(limit);
			const total = await Course.countDocuments(filter);
			res.status(200).json({
				data: courses,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
					search: search || null
				}
			});
		} catch (error) {
			if (process.env.NODE_ENV !== "production") console.error(error);
			res.status(500).json({ message: "Couldn't get courses" });
		}
	}
	static async getById(req, res) {
		try {
			const course = await Course.findById(req.params.id).populate("createdBy", "name email role image").populate({
				path: "chapters",
				options: { sort: { position: 1 } },
				populate: {
					path: "lessons",
					options: { sort: { position: 1 } }
				}
			});
			if (!course) return res.status(404).json({ message: "Course not found" });
			res.status(200).json({ data: course });
		} catch (error) {
			if (process.env.NODE_ENV !== "production") console.error(error);
			res.status(500).json({ message: "Couldn't get course" });
		}
	}
	static async getBySlug(req, res) {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
		try {
			let course = await Course.findOne({ slug: req.params.slug });
			if (!course) return res.status(404).json({ message: "Course not found" });
			const isEnrolled = await Enrollment.findOne({
				course: course._id,
				user: session?.user?.id,
				status: "active"
			});
			if (!session?.user?.id || !isEnrolled) {
				course = await Course.findOne({
					slug: req.params.slug,
					status: "Published"
				}).populate("createdBy", "name role").populate({
					path: "chapters",
					options: { sort: { position: 1 } },
					populate: {
						path: "lessons",
						select: "title  position",
						options: { sort: { position: 1 } }
					}
				});
				return res.status(200).json({ data: course });
			}
			if (isEnrolled) course = await Course.findOne({
				slug: req.params.slug,
				status: "Published"
			}).populate("createdBy", "name role image").populate({
				path: "chapters",
				options: { sort: { position: 1 } },
				populate: {
					path: "lessons",
					options: { sort: { position: 1 } }
				}
			});
			res.status(200).json({ data: course });
		} catch (error) {
			if (process.env.NODE_ENV !== "production") console.error(error);
			res.status(500).json({ message: "Couldn't get course" });
		}
	}
	static async update(req, res) {
		try {
			const updates = {
				...req.body,
				updatedAt: /* @__PURE__ */ new Date()
			};
			Object.keys(updates).forEach((key) => updates[key] === void 0 && delete updates[key]);
			if (updates.price !== void 0 && updates.price < 0) return res.status(400).json({ message: "Price must be positive" });
			if (updates.duration !== void 0 && updates.duration < 0) return res.status(400).json({ message: "Duration must be positive" });
			if (updates.slug) {
				let newSlug = slugify(updates.slug, {
					lower: true,
					strict: true
				});
				const exists = await Course.findOne({
					slug: newSlug,
					_id: { $ne: req.params.id }
				});
				if (exists) newSlug = `${newSlug}-${Date.now()}`;
				updates.slug = newSlug;
			}
			const course = await Course.findByIdAndUpdate(req.params.id, updates, {
				new: true,
				runValidators: true
			}).populate("createdBy", "name email role");
			if (!course) return res.status(404).json({ message: "Course not found" });
			res.status(200).json({
				message: "Course updated successfully",
				data: course
			});
		} catch (error) {
			if (process.env.NODE_ENV !== "production") console.error(error);
			if (error.name === "ValidationError") {
				const errors = Object.values(error.errors).map((err) => err.message);
				return res.status(400).json({
					message: "Validation failed",
					errors
				});
			}
			if (error.code === 11e3) return res.status(400).json({ message: "Course with this slug already exists" });
			res.status(500).json({ message: "Failed to update course" });
		}
	}
	static async delete(req, res) {
		try {
			const course = await Course.findById(req.params.id);
			if (!course) return res.status(404).json({ message: "Course not found" });
			const chapters = await Chapter.find({ course: course._id });
			for (const chapter of chapters) {
				const lessons = await Lesson.find({ chapter: chapter._id });
				for (const lesson of lessons) {
					if (lesson.thumbnailKey) await s3FileDelete(lesson.thumbnailKey);
					if (lesson.videoKey) await s3FileDelete(lesson.videoKey);
				}
				await Lesson.deleteMany({ chapter: chapter._id });
			}
			await Chapter.deleteMany({ course: course._id });
			if (course.fileKey) await s3FileDelete(course.fileKey);
			await course.deleteOne();
			res.status(200).json({ message: "Course and related chapters/lessons deleted successfully" });
		} catch (error) {
			if (process.env.NODE_ENV !== "production") console.error(error);
			res.status(500).json({ message: "Failed to delete course" });
		}
	}
};

//#endregion
//#region src/routers/productRoutes.ts
const router$5 = express.Router();
router$5.post("/s3/upload", fileUpload);
router$5.delete("/s3/delete", deleteFile);
router$5.post("/", CourseController.create);
router$5.get("/", CourseController.getAll);
router$5.get("/:id", CourseController.getById);
router$5.get("/slug/:slug", CourseController.getBySlug);
router$5.put("/:id", CourseController.update);
router$5.delete("/:id", CourseController.delete);
var productRoutes_default = router$5;

//#endregion
//#region src/lib/arcjet.ts
const aj = arcjet({
	key: process.env.ARCJET_KEY,
	characteristics: ["fingerprint"],
	rules: [shield({ mode: "LIVE" })]
});
var arcjet_default = aj;

//#endregion
//#region src/middleware/arcjet.middleware.ts
const emailOptions = {
	mode: "LIVE",
	block: [
		"DISPOSABLE",
		"INVALID",
		"NO_MX_RECORDS"
	]
};
const botOptions = {
	mode: "LIVE",
	allow: []
};
const rateLimitOptions = {
	mode: "LIVE",
	interval: "2m",
	max: 5
};
const signupOptions = {
	email: emailOptions,
	bots: botOptions,
	rateLimit: rateLimitOptions
};
async function protect(req) {
	const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
	const userId = session?.user.id || ip(req) || "127.0.0.1";
	try {
		if (req.originalUrl === "/api/auth/sign-up") {
			const body = req.body;
			if (typeof body?.email === "string") return arcjet_default.withRule(protectSignup(signupOptions)).protect(req, {
				email: body.email,
				fingerprint: userId
			});
			else return arcjet_default.withRule(detectBot(botOptions)).withRule(slidingWindow(rateLimitOptions)).protect(req, { fingerprint: userId });
		}
		if (req.originalUrl.startsWith("/api/product")) {
			if (req.method === "GET") return arcjet_default.withRule(detectBot(botOptions)).protect(req, { fingerprint: userId });
			if (!session?.user?.id || session.user.role !== "admin") return {
				isDenied: () => true,
				reason: {
					isCustom: () => true,
					message: "User not authorized."
				}
			};
			return arcjet_default.withRule(detectBot(botOptions)).withRule(fixedWindow({
				mode: "LIVE",
				window: "1m",
				max: 10
			})).protect(req, { fingerprint: userId });
		}
		if (req.originalUrl.startsWith("/api/enrollment")) {
			if (!session) return {
				isDenied: () => true,
				reason: {
					isCustom: () => true,
					message: "User not authenticated."
				}
			};
			return arcjet_default.withRule(detectBot(botOptions)).protect(req, { fingerprint: userId });
		}
		if (req.originalUrl.startsWith("/api/stats")) {
			if (!session?.user?.id || session.user.role !== "admin") return {
				isDenied: () => true,
				reason: {
					isCustom: () => true,
					message: "User not authorized."
				}
			};
			return arcjet_default.withRule(detectBot(botOptions)).protect(req, { fingerprint: userId });
		}
		return arcjet_default.withRule(detectBot(botOptions)).protect(req, { fingerprint: userId });
	} catch (e) {
		if (process.env.NODE_ENV !== "production") console.log("Arcjet error:", e);
		return {
			isDenied: () => false,
			reason: {
				isError: () => true,
				message: "Arcjet error"
			}
		};
	}
}
function arcjetMiddleware() {
	return async (req, res, next) => {
		const decision = await protect(req);
		if (decision.isDenied()) if (decision.reason.isRateLimit?.()) return res.status(429).json({ error: "Too Many Requests" });
		else if (decision.reason.isEmail?.()) {
			let message;
			if (decision.reason.emailTypes.includes("DISPOSABLE")) message = "Disposable email addresses are not allowed.";
			else if (decision.reason.emailTypes.includes("INVALID")) message = "Invalid email address.";
			else if (decision.reason.emailTypes.includes("NO_MX_RECORDS")) message = "Email domain does not have valid MX records.";
			else message = "Invalid email address.";
			return res.status(400).json({ error: message });
		} else if (decision.reason.isCustom?.()) return res.status(401).json({ error: "User not authenticated" });
		else return res.status(403).json({ error: "Forbidden" });
		req.arcjetDecision = decision;
		if (process.env.NODE_ENV === "development") {}
		next();
	};
}

//#endregion
//#region src/db/controllers/chapter.controller.ts
var ChapterController = class {
	static async create(req, res) {
		try {
			const { title, courseId } = req.body;
			if (!title || !courseId) return res.status(400).json({ message: "Title and courseId are required" });
			const course = await Course.findById(courseId);
			if (!course) return res.status(404).json({ message: "Course not found" });
			const existingChaptersCount = await Chapter.countDocuments({ course: courseId });
			const chapter = new Chapter({
				title,
				position: existingChaptersCount + 1,
				course: courseId
			});
			await chapter.save();
			course.chapters.push(chapter._id);
			await course.save();
			res.status(201).json({
				message: "Chapter created successfully",
				data: chapter
			});
		} catch (error) {
			console.error("Chapter creation error:", error);
			res.status(500).json({
				message: "Failed to create chapter",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async getAll(req, res) {
		try {
			const filter = req.query.courseId ? { course: req.query.courseId } : {};
			const chapters = await Chapter.find(filter).populate("lessons").sort({ position: 1 });
			res.status(200).json(chapters);
		} catch (error) {
			res.status(500).json({
				message: "Failed to get chapters",
				error
			});
		}
	}
	static async getById(req, res) {
		try {
			const chapter = await Chapter.findById(req.params.id).populate("lessons");
			if (!chapter) return res.status(404).json({ message: "Chapter not found" });
			res.status(200).json(chapter);
		} catch (error) {
			res.status(500).json({
				message: "Failed to get chapter",
				error
			});
		}
	}
	static async update(req, res) {
		try {
			const updates = {
				...req.body,
				updatedAt: /* @__PURE__ */ new Date()
			};
			const chapter = await Chapter.findByIdAndUpdate(req.params.id, updates, {
				new: true,
				runValidators: true
			});
			if (!chapter) return res.status(404).json({ message: "Chapter not found" });
			res.status(200).json({
				message: "Chapter updated successfully",
				data: chapter
			});
		} catch (error) {
			console.error("Chapter update error:", error);
			res.status(500).json({
				message: "Failed to update chapter",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async delete(req, res) {
		try {
			const chapter = await Chapter.findById(req.params.id);
			if (!chapter) return res.status(404).json({ message: "Chapter not found" });
			const lessons = await Lesson.find({ chapter: chapter._id });
			for (const lesson of lessons) {
				if (lesson.thumbnailKey) await s3FileDelete(lesson.thumbnailKey);
				if (lesson.videoKey) await s3FileDelete(lesson.videoKey);
			}
			await Lesson.deleteMany({ chapter: chapter._id });
			await Course.findByIdAndUpdate(chapter.course, { $pull: { chapters: chapter._id } });
			await chapter.deleteOne();
			const remainingChapters = await Chapter.find({ course: chapter.course }).sort({ position: 1 });
			for (let i = 0; i < remainingChapters.length; i++) {
				remainingChapters[i].position = i + 1;
				await remainingChapters[i].save();
			}
			res.status(200).json({ message: "Chapter and its lessons deleted successfully" });
		} catch (error) {
			console.error("Chapter deletion error:", error);
			res.status(500).json({
				message: "Failed to delete chapter",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
};

//#endregion
//#region src/routers/chapter.route.ts
const router$4 = express.Router();
router$4.post("/", ChapterController.create);
router$4.get("/", ChapterController.getAll);
router$4.get("/:id", ChapterController.getById);
router$4.put("/:id", ChapterController.update);
router$4.delete("/:id", ChapterController.delete);
var chapter_route_default = router$4;

//#endregion
//#region src/db/controllers/lesson.controller.ts
var LessonController = class {
	static async create(req, res) {
		try {
			const { title, description, thumbnailKey, videoKey, chapterId } = req.body;
			if (!title || !chapterId) return res.status(400).json({ message: "Title and chapterId are required" });
			const chapter = await Chapter.findById(chapterId);
			if (!chapter) return res.status(404).json({ message: "Chapter not found" });
			const existingLessonsCount = await Lesson.countDocuments({ chapter: chapterId });
			const lesson = new Lesson({
				title,
				description,
				thumbnailKey,
				videoKey,
				position: existingLessonsCount + 1,
				chapter: chapterId
			});
			await lesson.save();
			chapter.lessons.push(lesson._id);
			await chapter.save();
			res.status(201).json({
				message: "Lesson created successfully",
				data: lesson
			});
		} catch (error) {
			console.error("Lesson creation error:", error);
			res.status(500).json({
				message: "Failed to create lesson",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async getAll(req, res) {
		try {
			const filter = req.query.chapterId ? { chapter: req.query.chapterId } : {};
			const lessons = await Lesson.find(filter).sort({ position: 1 });
			res.status(200).json(lessons);
		} catch (error) {
			res.status(500).json({
				message: "Failed to get lessons",
				error
			});
		}
	}
	static async getById(req, res) {
		try {
			const lesson = await Lesson.findById(req.params.id);
			if (!lesson) return res.status(404).json({ message: "Lesson not found" });
			res.status(200).json(lesson);
		} catch (error) {
			res.status(500).json({
				message: "Failed to get lesson",
				error
			});
		}
	}
	static async update(req, res) {
		try {
			const updates = {
				...req.body,
				updatedAt: /* @__PURE__ */ new Date()
			};
			const lesson = await Lesson.findByIdAndUpdate(req.params.id, updates, {
				new: true,
				runValidators: true
			});
			if (!lesson) return res.status(404).json({ message: "Lesson not found" });
			res.status(200).json({
				message: "Lesson updated successfully",
				data: lesson
			});
		} catch (error) {
			console.error("Lesson update error:", error);
			res.status(500).json({
				message: "Failed to update lesson",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async delete(req, res) {
		try {
			const lesson = await Lesson.findById(req.params.id);
			if (!lesson) return res.status(404).json({ message: "Lesson not found" });
			const chapterId = lesson.chapter;
			const deletedPosition = lesson.position;
			if (lesson.thumbnailKey) await s3FileDelete(lesson.thumbnailKey);
			if (lesson.videoKey) await s3FileDelete(lesson.videoKey);
			await Chapter.findByIdAndUpdate(chapterId, { $pull: { lessons: lesson._id } });
			await lesson.deleteOne();
			await Lesson.updateMany({
				chapter: chapterId,
				position: { $gt: deletedPosition }
			}, { $inc: { position: -1 } });
			res.status(200).json({ message: "Lesson deleted and positions updated successfully" });
		} catch (error) {
			console.error("Delete lesson error:", error);
			res.status(500).json({
				message: "Failed to delete lesson",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
};

//#endregion
//#region src/routers/lesson.route.ts
const router$3 = express.Router();
router$3.post("/", LessonController.create);
router$3.get("/", LessonController.getAll);
router$3.get("/:id", LessonController.getById);
router$3.put("/:id", LessonController.update);
router$3.delete("/:id", LessonController.delete);
var lesson_route_default = router$3;

//#endregion
//#region src/db/controllers/enrollment.controller.ts
var EnrollmentController = class {
	static async create(req, res) {
		try {
			const { courseId } = req.body;
			const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
			if (!session?.user?.id) return res.status(401).json({ message: "Authentication required" });
			const userId = session.user.id;
			if (!courseId) return res.status(400).json({ message: "Course ID is required" });
			const course = await Course.findById(courseId);
			if (!course) return res.status(404).json({ message: "Course not found" });
			const existingEnrollment = await Enrollment.findOne({
				user: userId,
				course: courseId
			});
			if (existingEnrollment) return res.status(400).json({ message: "User is already enrolled in this course" });
			const enrollment = new Enrollment({
				user: userId,
				course: courseId,
				amount: course.price,
				status: "active"
			});
			await enrollment.save();
			await User.findByIdAndUpdate(userId, { $push: { enrollments: enrollment._id } });
			const populatedEnrollment = await Enrollment.findById(enrollment._id).populate("user", "name email").populate("course", "title fileKey price");
			res.status(201).json({
				message: "Enrollment created successfully",
				data: populatedEnrollment
			});
		} catch (error) {
			console.error("Enrollment creation error:", error);
			if (error.code === 11e3) return res.status(400).json({ message: "User is already enrolled in this course" });
			res.status(500).json({
				message: "Failed to create enrollment",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async getAll(req, res) {
		try {
			const page = parseInt(req.query.page) || 1;
			const limit = parseInt(req.query.limit) || 10;
			const skip = (page - 1) * limit;
			const filter = {};
			if (req.query.userId) filter.user = req.query.userId;
			if (req.query.courseId) filter.course = req.query.courseId;
			if (req.query.status) filter.status = req.query.status;
			const enrollments = await Enrollment.find(filter).populate("user", "name email role").populate("course", "title fileKey price status").sort({ createdAt: -1 }).skip(skip).limit(limit);
			const total = await Enrollment.countDocuments(filter);
			res.status(200).json({
				data: enrollments,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
					hasNext: page * limit < total,
					hasPrev: page > 1
				}
			});
		} catch (error) {
			console.error("Get enrollments error:", error);
			res.status(500).json({ message: "Failed to get enrollments" });
		}
	}
	static async getById(req, res) {
		try {
			const enrollment = await Enrollment.findById(req.params.id).populate("user", "name email role").populate("course", "title fileKey price status");
			if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
			res.status(200).json({ data: enrollment });
		} catch (error) {
			console.error("Get enrollment error:", error);
			res.status(500).json({ message: "Failed to get enrollment" });
		}
	}
	static async getUserEnrollments(req, res) {
		try {
			const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
			if (!session?.user?.id) return res.status(401).json({ message: "Authentication required" });
			const userId = req.params.userId || session.user.id;
			if (userId !== session.user.id && session.user.role !== "admin") return res.status(403).json({ message: "Access denied" });
			const page = parseInt(req.query.page) || 1;
			const limit = parseInt(req.query.limit) || 10;
			const skip = (page - 1) * limit;
			const filter = { user: userId };
			if (req.query.status) filter.status = req.query.status;
			const enrollments = await Enrollment.find(filter).populate("course", "title slug fileKey price status smallDescription").sort({ createdAt: -1 }).skip(skip).limit(limit);
			const total = await Enrollment.countDocuments(filter);
			res.status(200).json({
				data: enrollments,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
					hasNext: page * limit < total,
					hasPrev: page > 1
				}
			});
		} catch (error) {
			console.error("Get user enrollments error:", error);
			res.status(500).json({ message: "Failed to get user enrollments" });
		}
	}
	static async getCourseEnrollments(req, res) {
		try {
			const courseId = req.params.courseId;
			const page = parseInt(req.query.page) || 1;
			const limit = parseInt(req.query.limit) || 10;
			const skip = (page - 1) * limit;
			const course = await Course.findById(courseId);
			if (!course) return res.status(404).json({ message: "Course not found" });
			const filter = { course: courseId };
			if (req.query.status) filter.status = req.query.status;
			const enrollments = await Enrollment.find(filter).populate("user", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit);
			const total = await Enrollment.countDocuments(filter);
			res.status(200).json({
				data: enrollments,
				pagination: {
					page,
					limit,
					total,
					pages: Math.ceil(total / limit),
					hasNext: page * limit < total,
					hasPrev: page > 1
				}
			});
		} catch (error) {
			console.error("Get course enrollments error:", error);
			res.status(500).json({ message: "Failed to get course enrollments" });
		}
	}
	static async update(req, res) {
		try {
			const updates = {
				...req.body,
				updatedAt: /* @__PURE__ */ new Date()
			};
			delete updates.user;
			delete updates.course;
			const enrollment = await Enrollment.findByIdAndUpdate(req.params.id, updates, {
				new: true,
				runValidators: true
			}).populate("user", "name email").populate("course", "title fileKey price");
			if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
			res.status(200).json({
				message: "Enrollment updated successfully",
				data: enrollment
			});
		} catch (error) {
			console.error("Enrollment update error:", error);
			res.status(500).json({
				message: "Failed to update enrollment",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async updateProgress(req, res) {
		try {
			const { progress } = req.body;
			const enrollmentId = req.params.id;
			if (progress < 0 || progress > 100) return res.status(400).json({ message: "Progress must be between 0 and 100" });
			const enrollment = await Enrollment.findByIdAndUpdate(enrollmentId, {
				progress,
				updatedAt: /* @__PURE__ */ new Date(),
				...progress >= 100 && {
					status: "completed",
					completedAt: /* @__PURE__ */ new Date()
				}
			}, {
				new: true,
				runValidators: true
			}).populate("user", "name email").populate("course", "title fileKey");
			if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
			res.status(200).json({
				message: "Progress updated successfully",
				data: enrollment
			});
		} catch (error) {
			console.error("Progress update error:", error);
			res.status(500).json({
				message: "Failed to update progress",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async delete(req, res) {
		try {
			const enrollment = await Enrollment.findById(req.params.id);
			if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
			await User.findByIdAndUpdate(enrollment.user, { $pull: { enrollments: enrollment._id } });
			await enrollment.deleteOne();
			res.status(200).json({ message: "Enrollment deleted successfully" });
		} catch (error) {
			console.error("Enrollment deletion error:", error);
			res.status(500).json({
				message: "Failed to delete enrollment",
				error: process.env.NODE_ENV === "development" ? error.message : void 0
			});
		}
	}
	static async checkEnrollment(req, res) {
		try {
			const { courseId } = req.params;
			const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
			if (!session?.user?.id) return res.status(401).json({ message: "Authentication required" });
			const enrollment = await Enrollment.findOne({
				user: session.user.id,
				course: courseId,
				status: { $in: ["active", "completed"] }
			});
			res.status(200).json({
				isEnrolled: !!enrollment,
				enrollment: enrollment || null
			});
		} catch (error) {
			console.error("Check enrollment error:", error);
			res.status(500).json({ message: "Failed to check enrollment" });
		}
	}
	static async getStats(req, res) {
		try {
			const stats = await Enrollment.aggregate([{ $group: {
				_id: "$status",
				count: { $sum: 1 },
				totalAmount: { $sum: "$amount" },
				avgProgress: { $avg: "$progress" }
			} }]);
			const totalEnrollments = await Enrollment.countDocuments();
			const totalRevenue = await Enrollment.aggregate([{ $match: { status: { $in: ["active", "completed"] } } }, { $group: {
				_id: null,
				total: { $sum: "$amount" }
			} }]);
			res.status(200).json({ data: {
				byStatus: stats,
				totalEnrollments,
				totalRevenue: totalRevenue[0]?.total || 0
			} });
		} catch (error) {
			console.error("Get enrollment stats error:", error);
			res.status(500).json({ message: "Failed to get enrollment statistics" });
		}
	}
};

//#endregion
//#region src/routers/enrollment.route.ts
const router$2 = express.Router();
router$2.post("/", EnrollmentController.create);
router$2.get("/", EnrollmentController.getAll);
router$2.get("/stats", EnrollmentController.getStats);
router$2.get("/user/:userId", EnrollmentController.getUserEnrollments);
router$2.get("/course/:courseId", EnrollmentController.getCourseEnrollments);
router$2.get("/check/:courseId", EnrollmentController.checkEnrollment);
router$2.get("/:id", EnrollmentController.getById);
router$2.put("/:id", EnrollmentController.update);
router$2.patch("/:id/progress", EnrollmentController.updateProgress);
router$2.delete("/:id", EnrollmentController.delete);
var enrollment_route_default = router$2;

//#endregion
//#region src/services/stats.ts
var StatsService = class {
	/**
	* Get comprehensive dashboard statistics
	*/
	static async getDashboardStats() {
		try {
			const now = /* @__PURE__ */ new Date();
			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			const [userStats, courseStats, contentStats, enrollmentStats, engagementStats] = await Promise.all([
				this.getUserStats(startOfMonth, endOfMonth),
				this.getCourseStats(startOfMonth, endOfMonth),
				this.getContentStats(),
				this.getEnrollmentStats(startOfMonth, endOfMonth),
				this.getEngagementStats()
			]);
			return {
				users: userStats,
				courses: courseStats,
				content: contentStats,
				enrollments: enrollmentStats,
				engagement: engagementStats
			};
		} catch (error) {
			console.error("Error getting dashboard stats:", error);
			throw new Error("Failed to fetch dashboard statistics");
		}
	}
	/**
	* Get user-related statistics
	*/
	static async getUserStats(startOfMonth, endOfMonth) {
		const totalSignups = await User.countDocuments();
		const customersAggregation = await User.aggregate([
			{ $lookup: {
				from: "enrollments",
				localField: "_id",
				foreignField: "user",
				as: "enrollments"
			} },
			{ $match: { "enrollments.0": { $exists: true } } },
			{ $count: "totalCustomers" }
		]);
		const totalCustomers = customersAggregation[0]?.totalCustomers || 0;
		const newSignupsThisMonth = await User.countDocuments({ createdAt: {
			$gte: startOfMonth,
			$lte: endOfMonth
		} });
		const newCustomersAggregation = await User.aggregate([
			{ $lookup: {
				from: "enrollments",
				localField: "_id",
				foreignField: "user",
				as: "enrollments"
			} },
			{ $match: { "enrollments.0": { $exists: true } } },
			{ $addFields: { firstEnrollment: { $min: "$enrollments.createdAt" } } },
			{ $match: { firstEnrollment: {
				$gte: startOfMonth,
				$lte: endOfMonth
			} } },
			{ $count: "newCustomers" }
		]);
		const newCustomersThisMonth = newCustomersAggregation[0]?.newCustomers || 0;
		return {
			totalSignups,
			totalCustomers,
			newSignupsThisMonth,
			newCustomersThisMonth
		};
	}
	/**
	* Get course-related statistics
	*/
	static async getCourseStats(startOfMonth, endOfMonth) {
		const courseStatusCounts = await Course.aggregate([{ $group: {
			_id: "$status",
			count: { $sum: 1 }
		} }]);
		const statusMap = courseStatusCounts.reduce((acc, item) => {
			acc[item._id] = item.count;
			return acc;
		}, {});
		const totalCourses = await Course.countDocuments();
		const publishedCourses = statusMap["Published"] || 0;
		const draftCourses = statusMap["Draft"] || 0;
		const archivedCourses = statusMap["Archived"] || 0;
		const coursesCreatedThisMonth = await Course.countDocuments({ createdAt: {
			$gte: startOfMonth,
			$lte: endOfMonth
		} });
		return {
			totalCourses,
			publishedCourses,
			draftCourses,
			archivedCourses,
			coursesCreatedThisMonth
		};
	}
	/**
	* Get content-related statistics (chapters and lessons)
	*/
	static async getContentStats() {
		const [totalChapters, totalLessons] = await Promise.all([Chapter.countDocuments(), Lesson.countDocuments()]);
		const publishedCourses = await Course.find({ status: "Published" }, { _id: 1 });
		const publishedCourseIds = publishedCourses.map((course) => course._id);
		const [chaptersInPublishedCourses, chaptersInOtherCourses] = await Promise.all([Chapter.countDocuments({ course: { $in: publishedCourseIds } }), Chapter.countDocuments({ course: { $nin: publishedCourseIds } })]);
		const [publishedChapters, otherChapters] = await Promise.all([Chapter.find({ course: { $in: publishedCourseIds } }, { _id: 1 }), Chapter.find({ course: { $nin: publishedCourseIds } }, { _id: 1 })]);
		const publishedChapterIds = publishedChapters.map((chapter) => chapter._id);
		const otherChapterIds = otherChapters.map((chapter) => chapter._id);
		const [lessonsInPublishedCourses, lessonsInOtherCourses] = await Promise.all([Lesson.countDocuments({ chapter: { $in: publishedChapterIds } }), Lesson.countDocuments({ chapter: { $in: otherChapterIds } })]);
		return {
			totalChapters,
			totalLessons,
			lessonsInPublishedCourses,
			lessonsInOtherCourses,
			chaptersInPublishedCourses,
			chaptersInOtherCourses
		};
	}
	/**
	* Get enrollment-related statistics
	*/
	static async getEnrollmentStats(startOfMonth, endOfMonth) {
		const enrollmentStatusCounts = await Enrollment.aggregate([{ $group: {
			_id: "$status",
			count: { $sum: 1 },
			totalAmount: { $sum: "$amount" }
		} }]);
		const statusMap = enrollmentStatusCounts.reduce((acc, item) => {
			acc[item._id] = {
				count: item.count,
				revenue: item.totalAmount
			};
			return acc;
		}, {});
		const totalEnrollments = await Enrollment.countDocuments();
		const activeEnrollments = statusMap["active"]?.count || 0;
		const completedEnrollments = statusMap["completed"]?.count || 0;
		const pendingEnrollments = statusMap["pending"]?.count || 0;
		const cancelledEnrollments = statusMap["cancelled"]?.count || 0;
		const totalRevenue = (statusMap["active"]?.revenue || 0) + (statusMap["completed"]?.revenue || 0);
		const enrollmentsThisMonth = await Enrollment.countDocuments({ createdAt: {
			$gte: startOfMonth,
			$lte: endOfMonth
		} });
		const revenueThisMonthResult = await Enrollment.aggregate([{ $match: {
			createdAt: {
				$gte: startOfMonth,
				$lte: endOfMonth
			},
			status: { $in: ["active", "completed"] }
		} }, { $group: {
			_id: null,
			total: { $sum: "$amount" }
		} }]);
		const revenueThisMonth = revenueThisMonthResult[0]?.total || 0;
		return {
			totalEnrollments,
			activeEnrollments,
			completedEnrollments,
			pendingEnrollments,
			cancelledEnrollments,
			enrollmentsThisMonth,
			totalRevenue,
			revenueThisMonth
		};
	}
	/**
	* Get engagement-related statistics
	*/
	static async getEngagementStats() {
		const averageProgressResult = await Enrollment.aggregate([{ $match: { status: { $in: ["active", "completed"] } } }, { $group: {
			_id: null,
			averageProgress: { $avg: "$progress" }
		} }]);
		const averageProgressPerUser = averageProgressResult[0]?.averageProgress || 0;
		const mostPopularCourseResult = await Enrollment.aggregate([
			{ $group: {
				_id: "$course",
				enrollmentCount: { $sum: 1 }
			} },
			{ $sort: { enrollmentCount: -1 } },
			{ $limit: 1 },
			{ $lookup: {
				from: "courses",
				localField: "_id",
				foreignField: "_id",
				as: "courseInfo"
			} },
			{ $unwind: "$courseInfo" },
			{ $project: {
				title: "$courseInfo.title",
				enrollmentCount: 1
			} }
		]);
		const mostPopularCourse = mostPopularCourseResult[0] || null;
		const completedCount = await Enrollment.countDocuments({ status: "completed" });
		const totalActiveEnrollments = await Enrollment.countDocuments({ status: { $in: ["active", "completed"] } });
		const completionRate = totalActiveEnrollments > 0 ? completedCount / totalActiveEnrollments * 100 : 0;
		return {
			averageProgressPerUser: Math.round(averageProgressPerUser * 100) / 100,
			mostPopularCourse,
			completionRate: Math.round(completionRate * 100) / 100
		};
	}
	/**
	* Get stats for a specific time period
	*/
	static async getStatsForPeriod(startDate, endDate) {
		try {
			const [userStats, courseStats, enrollmentStats] = await Promise.all([
				this.getUserStats(startDate, endDate),
				this.getCourseStats(startDate, endDate),
				this.getEnrollmentStats(startDate, endDate)
			]);
			return {
				users: userStats,
				courses: courseStats,
				enrollments: enrollmentStats
			};
		} catch (error) {
			console.error("Error getting period stats:", error);
			throw new Error("Failed to fetch period statistics");
		}
	}
	/**
	* Get quick overview stats (for dashboard cards)
	*/
	static async getQuickStats() {
		try {
			const [totalUsers, totalCourses] = await Promise.all([User.countDocuments(), Course.countDocuments()]);
			const customersResult = await User.aggregate([
				{ $lookup: {
					from: "enrollments",
					localField: "_id",
					foreignField: "user",
					as: "enrollments"
				} },
				{ $match: { "enrollments.0": { $exists: true } } },
				{ $count: "totalCustomers" }
			]);
			const totalCustomers = customersResult[0]?.totalCustomers || 0;
			const revenueResult = await Enrollment.aggregate([{ $match: { status: { $in: ["active", "completed"] } } }, { $group: {
				_id: null,
				total: { $sum: "$amount" }
			} }]);
			const totalRevenue = revenueResult[0]?.total || 0;
			return {
				totalUsers,
				totalCustomers,
				totalCourses,
				totalRevenue
			};
		} catch (error) {
			console.error("Error getting quick stats:", error);
			throw new Error("Failed to fetch quick statistics");
		}
	}
};

//#endregion
//#region src/routers/stats.route.ts
const router$1 = express.Router();
router$1.get("/dashboard", async (req, res) => {
	try {
		const stats = await StatsService.getDashboardStats();
		res.status(200).json({ data: stats });
	} catch (error) {
		console.error("Stats error:", error);
		res.status(500).json({ message: "Failed to fetch statistics" });
	}
});
router$1.get("/quick", async (req, res) => {
	try {
		const stats = await StatsService.getQuickStats();
		res.status(200).json({ data: stats });
	} catch (error) {
		console.error("Quick stats error:", error);
		res.status(500).json({ message: "Failed to fetch quick statistics" });
	}
});
router$1.get("/period", async (req, res) => {
	try {
		const { startDate, endDate } = req.query;
		if (!startDate || !endDate) return res.status(400).json({ message: "Start date and end date are required" });
		const stats = await StatsService.getStatsForPeriod(new Date(startDate), new Date(endDate));
		res.status(200).json({ data: stats });
	} catch (error) {
		console.error("Period stats error:", error);
		res.status(500).json({ message: "Failed to fetch period statistics" });
	}
});
var stats_route_default = router$1;

//#endregion
//#region src/db/controllers/lessonProgress.controller.ts
var LessonProgressController = class {
	static async createOrUpdate(req, res) {
		try {
			const { lessonId } = req.params;
			const { completed = true } = req.body;
			const userId = req.user.id;
			const lesson = await Lesson.findById(lessonId).populate("chapter");
			if (!lesson) return res.status(404).json({ message: "Lesson not found" });
			const chapter = await mongoose.model("Chapter").findById(lesson.chapter);
			if (!chapter) return res.status(404).json({ message: "Chapter not found" });
			const enrollment = await Enrollment.findOne({
				user: userId,
				course: chapter.course,
				status: { $in: ["active", "completed"] }
			});
			if (!enrollment) return res.status(403).json({ message: "You must be enrolled in this course to track progress" });
			let lessonProgress = await LessonProgress.findOne({
				user: userId,
				lesson: lessonId
			});
			if (lessonProgress) {
				lessonProgress.completed = completed;
				await lessonProgress.save();
			} else {
				lessonProgress = new LessonProgress({
					user: userId,
					lesson: lessonId,
					completed
				});
				await lessonProgress.save();
				await Promise.all([Lesson.findByIdAndUpdate(lessonId, { $addToSet: { lessonProgress: lessonProgress._id } }), User.findByIdAndUpdate(userId, { $addToSet: { lessonProgress: lessonProgress._id } })]);
			}
			await lessonProgress.populate([{
				path: "lesson",
				select: "title position chapter"
			}, {
				path: "user",
				select: "name email"
			}]);
			res.status(200).json({
				message: completed ? "Lesson marked as completed" : "Lesson marked as incomplete",
				data: lessonProgress
			});
		} catch (error) {
			console.error("Create/Update lesson progress error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
	static async getByLessonAndUser(req, res) {
		try {
			const { lessonId } = req.params;
			const userId = req.user.id;
			const lessonProgress = await LessonProgress.findOne({
				user: userId,
				lesson: lessonId
			}).populate([{
				path: "lesson",
				select: "title position chapter"
			}, {
				path: "user",
				select: "name email"
			}]);
			if (!lessonProgress) return res.status(404).json({
				message: "No progress found for this lesson",
				data: { completed: false }
			});
			res.status(200).json({ data: lessonProgress });
		} catch (error) {
			console.error("Get lesson progress error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
	static async getChapterProgress(req, res) {
		try {
			const { chapterId } = req.params;
			const userId = req.user.id;
			const lessons = await Lesson.find({ chapter: chapterId }).select("_id title position").sort({ position: 1 });
			const lessonIds = lessons.map((lesson) => lesson._id);
			const progressRecords = await LessonProgress.find({
				user: userId,
				lesson: { $in: lessonIds }
			}).populate("lesson", "title position");
			const progressMap = progressRecords.reduce((acc, progress) => {
				acc[progress.lesson._id.toString()] = {
					completed: progress.completed,
					user: progress.user,
					lesson: progress.lesson._id,
					createdAt: progress.createdAt,
					updatedAt: progress.updatedAt,
					_id: progress._id
				};
				return acc;
			}, {});
			const chapterProgress = lessons.map((lesson) => ({
				lesson,
				progress: progressMap[lesson._id.toString()] ?? { completed: false }
			}));
			const totalLessons = lessons.length;
			const completedLessons = progressRecords.filter((p) => p.completed).length;
			const completionPercentage = totalLessons > 0 ? Math.round(completedLessons / totalLessons * 100) : 0;
			res.status(200).json({ data: {
				chapterId,
				lessons: chapterProgress,
				stats: {
					totalLessons,
					completedLessons,
					completionPercentage
				}
			} });
		} catch (error) {
			console.error("Get chapter progress error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
	static async getCourseProgress(req, res) {
		try {
			const { courseId } = req.params;
			const userId = req.user.id;
			const chapters = await mongoose.model("Chapter").find({ course: courseId }).select("_id title position").sort({ position: 1 });
			const chapterIds = chapters.map((chapter) => chapter._id);
			const lessons = await Lesson.find({ chapter: { $in: chapterIds } }).select("_id title position chapter").sort({
				chapter: 1,
				position: 1
			});
			const lessonIds = lessons.map((lesson) => lesson._id);
			const progressRecords = await LessonProgress.find({
				user: userId,
				lesson: { $in: lessonIds }
			}).populate("lesson", "title position chapter");
			const progressMap = progressRecords.reduce((acc, progress) => {
				acc[progress.lesson._id.toString()] = {
					completed: progress.completed,
					user: progress.user,
					lesson: progress.lesson._id,
					createdAt: progress.createdAt,
					updatedAt: progress.updatedAt,
					_id: progress._id
				};
				return acc;
			}, {});
			const courseProgress = chapters.map((chapter) => {
				const chapterLessons = lessons.filter((lesson) => lesson.chapter.toString() === chapter._id.toString()).map((lesson) => ({
					lesson,
					progress: progressMap[lesson._id.toString()] ?? { completed: false }
				}));
				const completedInChapter = chapterLessons.filter((l) => l.progress.completed).length;
				const chapterCompletionPercentage = chapterLessons.length > 0 ? Math.round(completedInChapter / chapterLessons.length * 100) : 0;
				return {
					chapter,
					lessons: chapterLessons,
					stats: {
						totalLessons: chapterLessons.length,
						completedLessons: completedInChapter,
						completionPercentage: chapterCompletionPercentage
					}
				};
			});
			const totalLessons = lessons.length;
			const completedLessons = progressRecords.filter((p) => p.completed).length;
			const overallCompletionPercentage = totalLessons > 0 ? Math.round(completedLessons / totalLessons * 100) : 0;
			res.status(200).json({ data: {
				courseId,
				chapters: courseProgress,
				stats: {
					totalChapters: chapters.length,
					totalLessons,
					completedLessons,
					completionPercentage: overallCompletionPercentage
				}
			} });
		} catch (error) {
			console.error("Get course progress error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
	static async getUserProgress(req, res) {
		try {
			const userId = req.user.id;
			const { page = 1, limit = 20 } = req.query;
			const pageNum = parseInt(page);
			const limitNum = parseInt(limit);
			const skip = (pageNum - 1) * limitNum;
			const enrollments = await Enrollment.find({
				user: userId,
				status: { $in: ["active", "completed"] }
			}).populate("course", "title slug").limit(limitNum).skip(skip).sort({ createdAt: -1 });
			const progressData = await Promise.all(enrollments.map(async (enrollment) => {
				const courseId = enrollment.course._id;
				const chapters = await mongoose.model("Chapter").find({ course: courseId });
				const chapterIds = chapters.map((c) => c._id);
				const lessons = await Lesson.find({ chapter: { $in: chapterIds } });
				const lessonIds = lessons.map((l) => l._id);
				const progressRecords = await LessonProgress.find({
					user: userId,
					lesson: { $in: lessonIds }
				});
				const totalLessons = lessons.length;
				const completedLessons = progressRecords.filter((p) => p.completed).length;
				const completionPercentage = totalLessons > 0 ? Math.round(completedLessons / totalLessons * 100) : 0;
				return {
					enrollment,
					progress: {
						totalLessons,
						completedLessons,
						completionPercentage,
						lastActivity: progressRecords.length > 0 ? Math.max(...progressRecords.map((p) => new Date(p.updatedAt).getTime())) : null
					}
				};
			}));
			const totalProgress = await LessonProgress.countDocuments({ user: userId });
			const completedProgress = await LessonProgress.countDocuments({
				user: userId,
				completed: true
			});
			res.status(200).json({
				data: progressData,
				pagination: {
					page: pageNum,
					limit: limitNum,
					total: enrollments.length
				},
				stats: {
					totalProgressRecords: totalProgress,
					totalCompletedLessons: completedProgress
				}
			});
		} catch (error) {
			console.error("Get user progress error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
	static async delete(req, res) {
		try {
			const { lessonId } = req.params;
			const userId = req.user.id;
			const lessonProgress = await LessonProgress.findOneAndDelete({
				user: userId,
				lesson: lessonId
			});
			if (!lessonProgress) return res.status(404).json({ message: "Lesson progress not found" });
			res.status(200).json({ message: "Lesson progress deleted successfully" });
		} catch (error) {
			console.error("Delete lesson progress error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
	static async getAnalytics(req, res) {
		try {
			const { courseId, chapterId, lessonId } = req.query;
			let matchConditions = {};
			const pipeline = [{ $lookup: {
				from: "lessons",
				localField: "lesson",
				foreignField: "_id",
				as: "lessonData"
			} }, { $unwind: "$lessonData" }];
			if (lessonId) matchConditions.lesson = new mongoose.Types.ObjectId(lessonId);
			if (chapterId) matchConditions["lessonData.chapter"] = new mongoose.Types.ObjectId(chapterId);
			if (courseId) {
				pipeline.push({ $lookup: {
					from: "chapters",
					localField: "lessonData.chapter",
					foreignField: "_id",
					as: "chapterData"
				} }, { $unwind: "$chapterData" });
				matchConditions["chapterData.course"] = new mongoose.Types.ObjectId(courseId);
			}
			if (Object.keys(matchConditions).length > 0) pipeline.push({ $match: matchConditions });
			pipeline.push({ $group: {
				_id: {
					lesson: "$lesson",
					lessonTitle: "$lessonData.title",
					completed: "$completed"
				},
				count: { $sum: 1 }
			} }, { $group: {
				_id: {
					lesson: "$_id.lesson",
					lessonTitle: "$_id.lessonTitle"
				},
				completedCount: { $sum: { $cond: [
					{ $eq: ["$_id.completed", true] },
					"$count",
					0
				] } },
				totalCount: { $sum: "$count" }
			} }, { $project: {
				lessonId: "$_id.lesson",
				lessonTitle: "$_id.lessonTitle",
				completedCount: 1,
				totalCount: 1,
				completionRate: { $round: [{ $multiply: [{ $divide: ["$completedCount", "$totalCount"] }, 100] }, 2] }
			} }, { $sort: { completionRate: -1 } });
			const analytics = await LessonProgress.aggregate(pipeline);
			res.status(200).json({ data: analytics });
		} catch (error) {
			console.error("Get lesson progress analytics error:", error);
			res.status(500).json({ message: "Internal server error" });
		}
	}
};

//#endregion
//#region src/routers/lessonProgress.route.ts
const router = express.Router();
router.get("/admin/analytics", LessonProgressController.getAnalytics);
router.get("/user/all", LessonProgressController.getUserProgress);
router.get("/chapter/:chapterId", LessonProgressController.getChapterProgress);
router.get("/course/:courseId", LessonProgressController.getCourseProgress);
router.get("/:lessonId", LessonProgressController.getByLessonAndUser);
router.post("/:lessonId", LessonProgressController.createOrUpdate);
router.delete("/:lessonId", LessonProgressController.delete);
var lessonProgress_route_default = router;

//#endregion
//#region src/middleware/auth.middleware.ts
async function authenticateToken(req, res, next) {
	try {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
		if (!session?.user) return res.status(401).json({ message: "Authentication required" });
		req.user = {
			id: session.user.id,
			email: session.user.email,
			role: session.user.role || "user",
			name: session.user.name
		};
		next();
	} catch (error) {
		console.error("Authentication error:", error);
		return res.status(401).json({ message: "Invalid token" });
	}
}

//#endregion
//#region src/index.ts
const app = express();
app.use(cors({
	origin: process.env.CORS_ORIGIN || "",
	methods: [
		"GET",
		"POST",
		"OPTIONS",
		"PUT",
		"DELETE"
	],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true
}));
app.all("/api/auth/{*path}", arcjetMiddleware(), toNodeHandler(auth));
app.use(express.json());
app.use("/api/product", arcjetMiddleware(), productRoutes_default);
app.use("/api/chapter", arcjetMiddleware(), chapter_route_default);
app.use("/api/lesson/progress", arcjetMiddleware(), authenticateToken, lessonProgress_route_default);
app.use("/api/lesson", arcjetMiddleware(), lesson_route_default);
app.use("/api/enrollment", arcjetMiddleware(), enrollment_route_default);
app.use("/api/stats", arcjetMiddleware(), stats_route_default);
app.get("/api/me", async (req, res) => {
	const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
	return res.json(session);
});
app.get("/", arcjetMiddleware(), (req, res) => {
	res.json({ message: "Hello World" });
});
process.env.PORT || 3e3;

//#endregion
export {  };