export interface ISourceAdapter {
  connect(): Promise<void>;
  fetchData(params?: any): Promise<any>;
  disconnect(): Promise<void>;
}
