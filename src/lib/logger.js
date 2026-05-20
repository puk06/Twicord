function error(context, err) {
    try {
        console.error(`[Twicord] ${context}`, err);
    } catch (e) {
        // fallback
        console.error("[Twicord]", context, err);
    }
}

function info(context, msg) {
    console.info(`[Twicord] ${context}`, msg);
}

module.exports = { error, info };
