import type { Document } from "@agentcenter/database";
import { documentDelegate } from "@agentcenter/database";
import { emit } from "../events";
import { EventTypes } from "../constants";
import { Model } from "./base";

class DocumentModel extends Model<Document> {
  constructor() {
    super(documentDelegate);
  }

  async emitCreated(
    doc: Pick<Document, "id" | "title">,
    ctx: {
      docType: string;
      taskId?: string;
      taskTitle?: string;
      createdBy: string;
      creatorName: string;
    },
  ) {
    await emit({ type: EventTypes.DOCUMENT_CREATED, documentId: doc.id, title: doc.title, ...ctx });
  }
}

export const documentModel = new DocumentModel();
