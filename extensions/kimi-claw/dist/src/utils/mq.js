export class MessageQueue {
    messages = [];
    waiters = [];
    isClosed = false;
    // 1. 发送消息 (类似 XADD)
    push(data) {
        if (this.isClosed)
            return;
        this.messages.push(data);
        // 通知所有正在等待新消息的消费者
        const pending = this.waiters;
        this.waiters = [];
        pending.forEach((resolve) => resolve());
    }
    // 2. 获取消息 (支持阻塞等待)
    // offset: 从哪个索引开始获取
    async read(offset) {
        // 如果 MQ 已关闭，返回 null
        if (this.isClosed)
            return null;
        // 如果请求的位置已经有消息了，直接返回
        if (offset < this.messages.length) {
            return this.messages.slice(offset);
        }
        // 如果还没有新消息，创建一个 Promise 挂起消费者
        return new Promise((resolve) => {
            const checkAndResolve = () => {
                if (this.isClosed) {
                    resolve(null);
                }
                else {
                    resolve(this.messages.slice(offset));
                }
            };
            this.waiters.push(checkAndResolve);
        });
    }
    // 3. 关闭 MQ (停止所有等待)
    close() {
        this.isClosed = true;
        const pending = this.waiters;
        this.waiters = [];
        pending.forEach((resolve) => resolve()); // 触发所有等待者，让它们根据 isClosed 状态退出
    }
}
