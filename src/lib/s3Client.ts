import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.AWS_ENDPOING_URL_S3,
  forcePathStyle: false,
});
