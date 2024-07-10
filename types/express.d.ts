import { IUser } from "../src/models/User";
import { Request } from "express";

export interface RequestWithUser extends Request {
  user?: IUser;
}
