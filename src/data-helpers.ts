import { declareType, TypedData, Types } from "ydb-sdk";

export class Link extends TypedData {
  @declareType(Types.UTF8)
  public id: string;

  @declareType(Types.UTF8)
  public link: string;

  constructor(data: { id: string; link: string }) {
    super(data);
    this.id = data.id;
    this.link = data.link;
  }
}
