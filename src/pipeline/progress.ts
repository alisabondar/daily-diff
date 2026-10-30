export interface Progress { running: boolean; stage: number; message: string }

let state: Progress = { running: false, stage: 0, message: '' };

export const progress = {
  get: (): Progress => ({ ...state }),
  set: (stage: number, message: string) => {
    state = { running: true, stage, message };
  },
  done: () => {
    state = { running: false, stage: 0, message: '' };
  },
};
