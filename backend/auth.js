import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export function signToken(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyToken(token, secret) {
  return jwt.verify(token, secret);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}
