import { asTrimmedNonEmptyString as asString } from "../utils/text.js";
export class AcpGatewaySessionState {
    sessions = new Map();
    promptsByGatewayRequestId = new Map();
    promptsByRunId = new Map();
    pendingHistoryRequests = new Map();
    metaIndex = 0;
    getInFlightPrompts() {
        return [...this.promptsByGatewayRequestId.values()].filter((run) => !run.done);
    }
    upsertSession(sessionId, cwd) {
        const now = Date.now();
        const existing = this.sessions.get(sessionId);
        const session = {
            id: sessionId,
            cwd: cwd ?? existing?.cwd ?? ".",
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            // Preserve active request continuity when session identity is reused.
            activePromptGatewayRequestId: existing?.activePromptGatewayRequestId,
        };
        this.sessions.set(sessionId, session);
        return session;
    }
    addPromptRun(promptRun) {
        this.promptsByGatewayRequestId.set(promptRun.gatewayRequestId, promptRun);
    }
    bindPromptRunToRunId(promptRun, runId) {
        promptRun.runId = runId;
        this.promptsByRunId.set(runId, promptRun);
    }
    resolvePromptRun(payload) {
        const runId = asString(payload.runId);
        if (runId) {
            const promptRun = this.promptsByRunId.get(runId);
            if (promptRun) {
                return promptRun;
            }
        }
        const requestId = asString(payload.requestId) ?? asString(payload.request_id);
        if (requestId) {
            const promptRun = this.promptsByGatewayRequestId.get(requestId);
            if (promptRun) {
                return promptRun;
            }
        }
        return undefined;
    }
    hasPendingHistoryRequest(requestId) {
        return this.pendingHistoryRequests.has(requestId);
    }
    setPendingHistoryRequest(requestId, request) {
        const existing = this.pendingHistoryRequests.get(requestId);
        this.clearPendingHistoryTimer(existing);
        this.pendingHistoryRequests.set(requestId, request);
    }
    takePendingHistoryRequest(requestId) {
        const pending = this.pendingHistoryRequests.get(requestId);
        this.pendingHistoryRequests.delete(requestId);
        this.clearPendingHistoryTimer(pending);
        return pending;
    }
    deletePendingHistoryRequest(requestId) {
        const pending = this.pendingHistoryRequests.get(requestId);
        this.pendingHistoryRequests.delete(requestId);
        this.clearPendingHistoryTimer(pending);
    }
    cleanupPromptRun(promptRun) {
        if (promptRun.timeoutTimer) {
            clearTimeout(promptRun.timeoutTimer);
            promptRun.timeoutTimer = undefined;
        }
        this.promptsByGatewayRequestId.delete(promptRun.gatewayRequestId);
        if (promptRun.runId) {
            this.promptsByRunId.delete(promptRun.runId);
        }
        const session = this.sessions.get(promptRun.sessionId);
        if (!session) {
            return;
        }
        if (session.activePromptGatewayRequestId === promptRun.gatewayRequestId) {
            session.activePromptGatewayRequestId = undefined;
        }
        if (!session.activePromptGatewayRequestId) {
            const nextPromptRun = [...this.promptsByGatewayRequestId.values()].find((run) => run.sessionId === promptRun.sessionId && !run.done);
            if (nextPromptRun) {
                session.activePromptGatewayRequestId = nextPromptRun.gatewayRequestId;
            }
        }
        session.updatedAt = Date.now();
    }
    peekNextMetaIndex() {
        return this.metaIndex + 1;
    }
    nextMetaIndex() {
        this.metaIndex += 1;
        return this.metaIndex;
    }
    clearPendingHistoryTimer(request) {
        if (!request?.timeoutTimer) {
            return;
        }
        clearTimeout(request.timeoutTimer);
        request.timeoutTimer = undefined;
    }
}
