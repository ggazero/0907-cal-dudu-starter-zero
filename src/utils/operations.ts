// 업무 로직: 신청 제출, 확정, 재선택 등 (operationId 중복 방지, 고객당 1개 신청)
import { DatabaseManager } from './database';
import { validateSubmission, validateConfirmation, decideRequestStatus } from './decide';
import type { OperationLog } from '../types';
import { getSupabase } from './supabase';

export class OperationManager {
  private db: DatabaseManager;
  private mode: 'local' | 'supabase';

  constructor(db: DatabaseManager, mode: 'local' | 'supabase' = 'local') {
    this.db = db;
    this.mode = mode;
  }

  // 신청 제출 (고객이 슬롯을 선택하고 제출)
  async submitRequest(
    customerId: string,
    selectedSlotIds: string[],
    operationId: string
  ): Promise<{
    success: boolean;
    requestId?: string;
    error?: string;
    log?: OperationLog;
  }> {
    if (this.mode === 'supabase') {
      return this.submitRequestSupabase(customerId, selectedSlotIds, operationId);
    }

    // 로컬 모드
    // operationId로 중복 제출 확인
    const idempotency = this.db.checkIdempotency(operationId);
    if (idempotency.isDuplicate) {
      return idempotency.cached as any;
    }

    let result: any = null;
    let logError: string | undefined;

    try {
      // 검증
      const validation = validateSubmission(selectedSlotIds, this.db.getState().slots);
      if (!validation.valid) {
        logError = validation.error;
        result = { success: false, error: validation.error };
        return result;
      }

      // 트랜잭션 시작
      this.db.beginTransaction();

      // 고객당 1개 신청만 허용 (미확정 요청이 없어야 함)
      const existingRequests = this.db.getRequestsByCustomerId(customerId);
      const hasPendingRequest = existingRequests.some(r => r.status !== 'confirmed');
      if (hasPendingRequest) {
        logError = 'Customer already has a pending request';
        result = { success: false, error: logError };
        this.db.rollbackTransaction();
        return result;
      }

      // 요청 생성
      const request = this.db.createRequest(customerId);
      if (!request) {
        logError = 'Failed to create request';
        result = { success: false, error: logError };
        this.db.rollbackTransaction();
        return result;
      }

      // 후보 추가 (우선순위 순서, version 포함)
      selectedSlotIds.forEach((slotId, index) => {
        this.db.addCandidate(request.id, slotId, index + 1, request.version);
      });

      // 트랜잭션 커밋
      this.db.commitTransaction();

      // 로그 생성 및 저장
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'submit',
        requestId: request.id,
        status: 'success',
      });

      result = { success: true, requestId: request.id, log };
      return result;
    } catch (error) {
      this.db.rollbackTransaction();
      logError = String(error);
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'submit',
        requestId: '',
        status: 'failed',
        error: logError,
      });
      result = { success: false, error: logError, log };
      return result;
    } finally {
      // 결과 캐싱 (성공/실패 모두 기록)
      this.db.recordOperation(operationId, result, logError);
    }
  }

  private async submitRequestSupabase(
    customerId: string,
    selectedSlotIds: string[],
    operationId: string
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      const client = getSupabase();
      const result = await client.rpc('submit_request', {
        p_customer_id: customerId,
        p_slot_ids: selectedSlotIds,
        p_operation_id: operationId,
      });

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      const data = result.data as any;
      if (!data.success) {
        return { success: false, error: data.error };
      }

      return { success: true, requestId: data.requestId };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // 어드민 확정 (동일 슬롯 또는 동일 고객의 중복 확정 방지)
  async confirmRequest(
    requestId: string,
    selectedSlotId: string,
    adminId: string,
    operationId: string
  ): Promise<{
    success: boolean;
    error?: string;
    affectedRequests?: string[];
    log?: OperationLog;
  }> {
    if (this.mode === 'supabase') {
      return this.confirmRequestSupabase(requestId, selectedSlotId, adminId, operationId);
    }

    // 로컬 모드
    // operationId로 중복 확인
    const idempotency = this.db.checkIdempotency(operationId);
    if (idempotency.isDuplicate) {
      return idempotency.cached as any;
    }

    let result: any = null;
    let logError: string | undefined;

    try {
      const request = this.db.getRequest(requestId);
      if (!request) {
        logError = 'Request not found';
        result = { success: false, error: logError };
        return result;
      }

      const candidates = this.db.getAllCandidates();
      const slots = this.db.getState().slots;

      // 확정 검증
      const validation = validateConfirmation(request, selectedSlotId, candidates, slots);
      if (!validation.valid) {
        logError = validation.error;
        result = { success: false, error: logError };
        return result;
      }

      // 트랜잭션: 슬롯 마감 + 요청 확정 + 영향받은 다른 요청 갱신
      const affectedRequests: string[] = [];

      this.db.beginTransaction();

      try {
        // 슬롯 마감
        this.db.updateSlot(selectedSlotId, {
          status: 'confirmed',
          confirmedBy: request.customerId,
          confirmedAt: new Date().toISOString(),
        });

        // 요청 확정
        this.db.updateRequest(requestId, {
          status: 'confirmed',
          confirmedSlotId: selectedSlotId,
          confirmedAt: new Date().toISOString(),
        });

        // 현재 version에서 모든 후보가 마감된 요청만 needs_reselection으로 갱신
        // 마감이 반영된 트랜잭션 작업본으로 후보 가용성을 확인한다.
        const dbSlots = this.db.getState().slots;
        const allRequests = this.db.getAllRequests();
        allRequests.forEach(otherRequest => {
          if (otherRequest.id === requestId) return;
          if (otherRequest.status === 'confirmed') return;

          // 현재 version의 후보만 필터
          const otherCurrentCandidates = candidates.filter(
            c => c.requestId === otherRequest.id && c.version === otherRequest.version
          );

          // 마감된 슬롯을 포함하고 있나
          const hasConfirmedSlot = otherCurrentCandidates.some(c => c.slotId === selectedSlotId);

          if (hasConfirmedSlot) {
            // 현재 version에서 available 슬롯이 남아있는지 확인
            const hasAvailable = otherCurrentCandidates.some(c => {
              const slot = dbSlots[c.slotId];
              return slot && slot.status === 'available';
            });

            if (!hasAvailable) {
              // 모든 현재 후보가 마감됨 → needs_reselection
              this.db.updateRequest(otherRequest.id, {
                status: 'needs_reselection',
              });
              affectedRequests.push(otherRequest.id);
            }
          }
        });

        this.db.commitTransaction();
      } catch (txError) {
        this.db.rollbackTransaction();
        throw txError;
      }

      // 로그
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'confirm',
        requestId,
        adminId,
        slotId: selectedSlotId,
        status: 'success',
      });

      result = { success: true, affectedRequests, log };
      return result;
    } catch (error) {
      this.db.rollbackTransaction();
      logError = String(error);
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'confirm',
        requestId,
        adminId,
        slotId: selectedSlotId,
        status: 'failed',
        error: logError,
      });
      result = { success: false, error: logError, log };
      return result;
    } finally {
      this.db.recordOperation(operationId, result, logError);
    }
  }

  private async confirmRequestSupabase(
    requestId: string,
    selectedSlotId: string,
    adminId: string,
    operationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = getSupabase();
      const result = await client.rpc('confirm_request', {
        p_request_id: requestId,
        p_slot_id: selectedSlotId,
        p_admin_id: adminId,
        p_operation_id: operationId,
      });

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      const data = result.data as any;
      if (!data.success) {
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // 고객이 재선택 제출 (새로운 후보로)
  async resubmitRequest(
    customerId: string,
    previousRequestId: string,
    newSlotIds: string[],
    operationId: string
  ): Promise<{
    success: boolean;
    requestId?: string;
    error?: string;
    log?: OperationLog;
  }> {
    if (this.mode === 'supabase') {
      return this.resubmitRequestSupabase(customerId, previousRequestId, newSlotIds, operationId);
    }

    // 로컬 모드
    // operationId로 중복 제출 확인
    const idempotency = this.db.checkIdempotency(operationId);
    if (idempotency.isDuplicate) {
      return idempotency.cached as any;
    }

    let result: any = null;
    let logError: string | undefined;

    try {
      const previousRequest = this.db.getRequest(previousRequestId);
      if (!previousRequest) {
        logError = 'Previous request not found';
        result = { success: false, error: logError };
        return result;
      }

      // 소유자 확인
      if (previousRequest.customerId !== customerId) {
        logError = 'Not request owner';
        result = { success: false, error: logError };
        return result;
      }

      // 이전 요청의 상태 확인
      if (previousRequest.status === 'confirmed') {
        logError = 'Cannot reselect confirmed request';
        result = { success: false, error: logError };
        return result;
      }

      // 검증
      const validation = validateSubmission(newSlotIds, this.db.getState().slots);
      if (!validation.valid) {
        logError = validation.error;
        result = { success: false, error: logError };
        return result;
      }

      // 트랜잭션 시작
      this.db.beginTransaction();

      // 기존 요청 업데이트 (version 증가, 상태 received)
      const newVersion = previousRequest.version + 1;
      this.db.updateRequest(previousRequestId, {
        version: newVersion,
        status: 'received',
      });

      // 새 후보 추가 (같은 requestId 유지)
      newSlotIds.forEach((slotId, index) => {
        this.db.addCandidate(previousRequest.id, slotId, index + 1, newVersion);
      });

      this.db.commitTransaction();

      // 로그
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'reselect',
        requestId: previousRequestId,
        status: 'success',
      });

      result = { success: true, requestId: previousRequestId, log };
      return result;
    } catch (error) {
      this.db.rollbackTransaction();
      logError = String(error);
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'reselect',
        requestId: previousRequestId,
        status: 'failed',
        error: logError,
      });
      result = { success: false, error: logError, log };
      return result;
    } finally {
      this.db.recordOperation(operationId, result, logError);
    }
  }

  private async resubmitRequestSupabase(
    customerId: string,
    previousRequestId: string,
    newSlotIds: string[],
    operationId: string
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      const client = getSupabase();
      const result = await client.rpc('resubmit_request', {
        p_customer_id: customerId,
        p_request_id: previousRequestId,
        p_slot_ids: newSlotIds,
        p_operation_id: operationId,
      });

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      const data = result.data as any;
      if (!data.success) {
        return { success: false, error: data.error };
      }

      return { success: true, requestId: data.requestId };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  // 고객의 현재 상태 조회
  getCustomerStatus(customerId: string) {
    if (this.mode === 'supabase') {
      // Supabase는 비동기 조회이므로, CustomerPage에서 useEffect로 처리
      return [];
    }

    const requests = this.db.getRequestsByCustomerId(customerId);
    const candidates = this.db.getAllCandidates();
    const slots = this.db.getState().slots;

    return requests.map(request => {
      const requestCandidates = candidates.filter(c => c.requestId === request.id);
      const decision = decideRequestStatus(request, candidates, slots);

      return {
        request,
        candidates: requestCandidates.sort((a, b) => a.priority - b.priority),
        decision,
      };
    });
  }

  async getCustomerStatusSupabase(customerId: string): Promise<any[]> {
    try {
      const client = getSupabase();
      const { data: requestsData, error: reqError } = await client
        .from('requests')
        .select('*')
        .eq('customer_id', customerId);

      if (reqError) throw reqError;
      if (!requestsData || requestsData.length === 0) return [];

      const { data: candidatesData, error: candError } = await client
        .from('candidates')
        .select('*');

      if (candError) throw candError;

      const { data: slotsData, error: slotError } = await client
        .from('slots')
        .select('*');

      if (slotError) throw slotError;

      const slotsRecord: Record<string, any> = {};
      (slotsData || []).forEach((s: any) => {
        slotsRecord[s.id] = {
          id: s.id,
          date: s.date,
          timeLabel: s.time_label,
          status: s.status,
          confirmedAt: s.confirmed_at,
          confirmedBy: s.confirmed_by,
        };
      });

      const allCandidates = (candidatesData || []).map((c: any) => ({
        id: c.id,
        requestId: c.request_id,
        slotId: c.slot_id,
        priority: c.priority,
        version: c.version,
        queueSeq: c.queue_seq,
      }));

      return (requestsData || []).map((request: any) => {
        const requestCandidates = allCandidates
          .filter((c: any) => c.requestId === request.id)
          .sort((a: any, b: any) => a.priority - b.priority);

        const decision = decideRequestStatus(
          { id: request.id, customerId: request.customer_id, version: request.version, createdAt: request.created_at, status: request.status } as any,
          allCandidates,
          slotsRecord
        );

        return {
          request: { id: request.id, customerId: request.customer_id, version: request.version, createdAt: request.created_at, status: request.status, confirmedSlotId: request.confirmed_slot_id, confirmedAt: request.confirmed_at } as any,
          candidates: requestCandidates,
          decision,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // 어드민 요청 목록
  getAdminRequests() {
    if (this.mode === 'supabase') {
      return [];
    }

    const requests = this.db.getAllRequests();
    const candidates = this.db.getAllCandidates();
    const slots = this.db.getState().slots;

    return requests
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(request => {
        const requestCandidates = candidates.filter(c => c.requestId === request.id);
        const decision = decideRequestStatus(request, candidates, slots);

        return {
          request,
          candidates: requestCandidates.sort((a, b) => a.priority - b.priority),
          decision,
        };
      });
  }

  async getAdminRequestsSupabase(): Promise<any[]> {
    try {
      const client = getSupabase();
      const { data: requestsData, error: reqError } = await client
        .from('requests')
        .select('*')
        .order('created_at', { ascending: true });

      if (reqError) throw reqError;
      if (!requestsData || requestsData.length === 0) return [];

      const { data: candidatesData, error: candError } = await client
        .from('candidates')
        .select('*');

      if (candError) throw candError;

      const { data: slotsData, error: slotError } = await client
        .from('slots')
        .select('*');

      if (slotError) throw slotError;

      const slotsRecord: Record<string, any> = {};
      (slotsData || []).forEach((s: any) => {
        slotsRecord[s.id] = {
          id: s.id,
          date: s.date,
          timeLabel: s.time_label,
          status: s.status,
          confirmedAt: s.confirmed_at,
          confirmedBy: s.confirmed_by,
        };
      });

      const allCandidates = (candidatesData || []).map((c: any) => ({
        id: c.id,
        requestId: c.request_id,
        slotId: c.slot_id,
        priority: c.priority,
        version: c.version,
        queueSeq: c.queue_seq,
      }));

      return (requestsData || []).map((request: any) => {
        const requestCandidates = allCandidates
          .filter((c: any) => c.requestId === request.id)
          .sort((a: any, b: any) => a.priority - b.priority);

        const decision = decideRequestStatus(
          { id: request.id, customerId: request.customer_id, version: request.version, createdAt: request.created_at, status: request.status } as any,
          allCandidates,
          slotsRecord
        );

        return {
          request: { id: request.id, customerId: request.customer_id, version: request.version, createdAt: request.created_at, status: request.status, confirmedSlotId: request.confirmed_slot_id, confirmedAt: request.confirmed_at } as any,
          candidates: requestCandidates,
          decision,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // 관리자가 신청을 재선택 필요 상태로 변경
  async requestReselection(
    requestId: string,
    adminId: string,
    operationId: string
  ): Promise<{
    success: boolean;
    error?: string;
    log?: OperationLog;
  }> {
    if (this.mode === 'supabase') {
      return this.requestReselectionSupabase(requestId, adminId, operationId);
    }

    // 로컬 모드
    const idempotency = this.db.checkIdempotency(operationId);
    if (idempotency.isDuplicate) {
      return idempotency.cached as any;
    }

    let result: any = null;
    let logError: string | undefined;

    try {
      const request = this.db.getRequest(requestId);
      if (!request) {
        logError = 'Request not found';
        result = { success: false, error: logError };
        return result;
      }

      // 이미 확정된 요청은 재선택 요청 불가
      if (request.status === 'confirmed') {
        logError = 'Cannot request reselection for confirmed request';
        result = { success: false, error: logError };
        return result;
      }

      // 트랜잭션
      this.db.beginTransaction();

      try {
        this.db.updateRequest(requestId, {
          status: 'needs_reselection',
        });

        this.db.commitTransaction();
      } catch (txError) {
        this.db.rollbackTransaction();
        throw txError;
      }

      // 로그
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'confirm',
        requestId,
        adminId,
        status: 'success',
        error: 'admin_requested_reselection',
      });

      result = { success: true, log };
      return result;
    } catch (error) {
      this.db.rollbackTransaction();
      logError = String(error);
      const log = this.db.addLog({
        timestamp: new Date().toISOString(),
        action: 'confirm',
        requestId,
        adminId,
        status: 'failed',
        error: logError,
      });
      result = { success: false, error: logError, log };
      return result;
    } finally {
      this.db.recordOperation(operationId, result, logError);
    }
  }

  private async requestReselectionSupabase(
    requestId: string,
    adminId: string,
    operationId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = getSupabase();
      const result = await client.rpc('request_reselection', {
        p_request_id: requestId,
        p_admin_id: adminId,
        p_operation_id: operationId,
      });

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      const data = result.data as any;
      if (!data.success) {
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
