export type OrderStepId = "zk-proof" | "seal-encrypt" | "submit-tx" | "await-match" | "settlement";
export type CancelStepId = "build-tx" | "sign-execute";
export type StepStatus = "pending" | "active" | "complete" | "error";

export interface StepState {
  id: OrderStepId | CancelStepId;
  label: string;
  desc: string;
  status: StepStatus;
  errorMessage?: string;
}

export type ProgressCallback = (
  stepId: OrderStepId | CancelStepId,
  status: StepStatus,
  errorMessage?: string
) => void;
