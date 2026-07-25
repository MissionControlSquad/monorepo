import { gql } from "urql";
export const REGISTER_LOCAL_SERVICE = gql`mutation RegisterLocalService($key:String!,$kind:String,$command:String){ registerLocalService(key:$key,kind:$kind,command:$command){ id key status } }`;
