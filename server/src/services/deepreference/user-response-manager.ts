/**
 * 用户响应管理器
 * 用于在工作流执行中等待用户的交互响应
 */

export interface UserResponse {
  selectedOption: string;
  data?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (response: UserResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout | null;
  confirmationType: string;
}

class UserResponseManager {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  
  /**
   * 等待用户响应
   * @param sessionId 会话ID
   * @param confirmationType 确认类型
   * @param timeoutMs 超时时间（毫秒），默认5分钟
   */
  waitForResponse(
    sessionId: string,
    confirmationType: string,
    timeoutMs: number = 5 * 60 * 1000
  ): Promise<UserResponse> {
    return new Promise((resolve, reject) => {
      // 清理之前的请求（如果有）
      this.cancelRequest(sessionId);
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(sessionId);
        reject(new Error(`用户响应超时 (${confirmationType})`));
      }, timeoutMs);
      
      this.pendingRequests.set(sessionId, {
        resolve,
        reject,
        timeout,
        confirmationType,
      });
      
      console.log(`[UserResponseManager] 等待用户响应: sessionId=${sessionId}, type=${confirmationType}`);
    });
  }
  
  /**
   * 提交用户响应
   * @param sessionId 会话ID
   * @param response 用户响应
   */
  submitResponse(sessionId: string, response: UserResponse): boolean {
    const pending = this.pendingRequests.get(sessionId);
    if (!pending) {
      console.warn(`[UserResponseManager] 没有等待中的请求: sessionId=${sessionId}`);
      return false;
    }
    
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    
    this.pendingRequests.delete(sessionId);
    pending.resolve(response);
    
    console.log(`[UserResponseManager] 收到用户响应: sessionId=${sessionId}, option=${response.selectedOption}`);
    return true;
  }
  
  /**
   * 取消等待中的请求
   */
  cancelRequest(sessionId: string): void {
    const pending = this.pendingRequests.get(sessionId);
    if (pending) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      this.pendingRequests.delete(sessionId);
      pending.reject(new Error('请求已取消'));
    }
  }
  
  /**
   * 检查是否有等待中的请求
   */
  hasPendingRequest(sessionId: string): boolean {
    return this.pendingRequests.has(sessionId);
  }
  
  /**
   * 获取等待中的请求信息
   */
  getPendingInfo(sessionId: string): { confirmationType: string } | null {
    const pending = this.pendingRequests.get(sessionId);
    if (!pending) return null;
    return { confirmationType: pending.confirmationType };
  }
}

export const userResponseManager = new UserResponseManager();
