import z from "zod";
import express from "express";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import slugify from "slugify";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3Client";

export const fileUploadSchema = z.object({
  fileName: z.string().min(1, { message: "File naem missing" }),
  contentType: z.string().min(1, { message: "Content type missing" }),
  size: z.number().min(1, { message: "File size missing" }),
  isImage: z.boolean(),
});

export const fileUpload: express.RequestHandler = async (
  req: express.Request,
  res: express.Response,
) => {
  try {
    const data = req.body;
    if (process.env.NODE_ENV !== "production")
      console.log("File upload request data:", data);

    const validation = fileUploadSchema.safeParse(data);
    if (!validation.success) {
      if (process.env.NODE_ENV !== "production")
        console.log("File upload validation:", validation);
      return res
        .status(400)
        .json({ success: false, message: "Validation error" });
    }
    const { fileName, contentType, size } = validation.data;

    //unique key for each file
    const uniqueKey = `${uuidv4()}-${slugify(fileName)}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME_S3 as string,
      ContentType: contentType,
      ContentLength: size,
      Key: uniqueKey,
    });

    //get presigned url
    const presignedUrl = await getSignedUrl(s3, command, {
      expiresIn: 360, //6minutes
    });
    if (process.env.NODE_ENV !== "production")
      console.log("Presigned URL generated:", presignedUrl);

    //return the presigned url and the key
    const response = {
      presignedUrl,
      key: uniqueKey,
    };

    return res.status(200).json(response);
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

//delete file function
export const deleteFile = async (
  req: express.Request,
  res: express.Response,
) => {
  try {
    const data = req.body;
    if (process.env.NODE_ENV !== "production")
      console.log("File delete request data:", data);

    const { key } = data;
    if (!key || typeof key !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "File key missing or invalid" });
    }

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME_S3 as string,
      Key: key,
    });

    await s3.send(deleteCommand);
    if (process.env.NODE_ENV !== "production")
      console.log("File deleted:", key);

    return res
      .status(200)
      .json({ success: true, message: "File deleted successfully" });
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.log(e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export async function s3FileDelete(key: string) {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME_S3 as string,
      Key: key,
    });

    await s3.send(deleteCommand);
  } catch (e) {
    console.error(e);
  }
}
