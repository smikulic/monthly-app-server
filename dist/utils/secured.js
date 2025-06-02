import { withErrorHandle } from "./withErrorHandle";
import { withAuth } from "./withAuth";
export function secured(resolver) {
    return withErrorHandle(withAuth(resolver));
}
