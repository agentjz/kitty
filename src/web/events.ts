import type { ServerResponse } from "node:http";

export class WebEventHub {
  private readonly clients = new Set<ServerResponse>();
  private sequence = 0;
  private closed = false;

  add(response: ServerResponse): () => void {
    if (this.closed) {
      response.end();
      return () => undefined;
    }
    this.clients.add(response);
    response.write(`event: ready\ndata: ${JSON.stringify({ sequence: this.sequence })}\n\n`);
    return () => this.clients.delete(response);
  }

  publish(type: string, data: unknown): void {
    if (this.closed) return;
    const payload = `id: ${++this.sequence}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) client.write(payload);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
