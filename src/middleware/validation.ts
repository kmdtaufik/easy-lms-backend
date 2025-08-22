import { body, validationResult } from "express-validator";
import express from "express";
export const validateEmail = [
  body("email")
    .isEmail()
    .withMessage("Invalid email address.")
    .normalizeEmail(),

  (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return; // make sure we stop here
    }
    next();
  },
];
