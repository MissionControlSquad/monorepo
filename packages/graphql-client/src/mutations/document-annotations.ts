import { gql } from "urql";
export const CREATE_ANNOTATION_THREAD = gql`mutation CreateAnnotationThread($documentId:String!,$startOffset:Int!,$endOffset:Int!){ createAnnotationThread(documentId:$documentId,startOffset:$startOffset,endOffset:$endOffset){ id quote startOffset endOffset status } }`;
export const ADD_ANNOTATION_COMMENT = gql`mutation AddAnnotationComment($threadId:String!,$body:String!){ addAnnotationComment(threadId:$threadId,body:$body){ id body createdAt } }`;
export const RESOLVE_ANNOTATION_THREAD = gql`mutation ResolveAnnotationThread($threadId:String!){ resolveAnnotationThread(threadId:$threadId) }`;
export const ACQUIRE_DOCUMENT_LOCK = gql`mutation AcquireDocumentLock($documentId:String!){ acquireDocumentLock(documentId:$documentId){ acquired heldByProfileId expiresAt } }`;
export const RELEASE_DOCUMENT_LOCK = gql`mutation ReleaseDocumentLock($documentId:String!){ releaseDocumentLock(documentId:$documentId) }`;
