import { gql } from "urql";
export const ANNOTATION_THREADS_QUERY = gql`query AnnotationThreads($documentId:String!,$includeResolved:Boolean){ annotationThreads(documentId:$documentId,includeResolved:$includeResolved){ id documentId quote startOffset endOffset status confidence createdAt comments { id body authorProfileId authorAgentId createdAt } } }`;
