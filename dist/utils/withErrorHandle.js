export function withErrorHandle(resolver) {
    return async function (parent, args, context, info) {
        try {
            return await resolver(parent, args, context, info);
        }
        catch (error) {
            // Optionally log error here (e.g., Sentry)
            throw error;
        }
    };
}
