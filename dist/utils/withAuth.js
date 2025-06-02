export const ensureAuthenticated = (currentUser) => {
    if (currentUser === null) {
        throw new Error("Unauthenticated!");
    }
    if (!currentUser.emailConfirmed) {
        throw new Error("Please confirm your email before continuing");
    }
};
export function withAuth(resolver) {
    return async function (parent, args, context, info) {
        ensureAuthenticated(context.currentUser);
        return resolver(parent, args, context, info);
    };
}
