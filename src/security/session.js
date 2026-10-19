/**
 * Inicia (ou renova) a sessão do usuário com um novo id de sessão, evitando
 * fixação de sessão. sessionVersion precisa ser igual a app_user.session_version.
 */
function startSession(req, { id, session_version: sessionVersion }) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            req.session.userId = id;
            req.session.sessionVersion = sessionVersion;
            return req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
        });
    });
}

module.exports = { startSession };
