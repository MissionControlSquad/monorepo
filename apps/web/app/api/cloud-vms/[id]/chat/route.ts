import { prisma } from "@/server/prisma";
import { sshUploadFile } from "@/server/services/ssh";
import { getVMSSHConfig, ocExecStream } from "@/server/services/cloud-vm-utils";

/**
 * POST /api/cloud-vms/[id]/chat
 * Send a message to an OpenClaw agent via the CLI and stream the response.
 * Uses `openclaw agent --message` instead of the OpenAI HTTP API.
 *
 * Body: { message: string, agentId?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { message, agentId } = body;

  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const vm = await prisma.cloudVM.findUnique({
    where: { id },
    select: { ipv4: true, sshPrivateKey: true, status: true },
  });

  if (!vm) {
    return new Response(JSON.stringify({ error: "VM not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (vm.status !== "running" || !vm.ipv4 || !vm.sshPrivateKey) {
    return new Response(JSON.stringify({ error: "VM is not running" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sshConfig = getVMSSHConfig(vm);

  if (!agentId || typeof agentId !== "string") {
    return new Response(JSON.stringify({ error: "agentId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetAgent = agentId;

  // Write message to a temp file to avoid shell escaping issues
  const tmpPath = `/tmp/chat-msg-${Date.now()}.txt`;
  await sshUploadFile(sshConfig, tmpPath, message);

  // Use openclaw CLI directly — reads message from file via $()
  const cmd = `openclaw agent --agent ${targetAgent} --message "$(cat ${tmpPath})" --timeout 300`;

  const encoder = new TextEncoder();
  let closed = false;
  let sshHandle: Awaited<ReturnType<typeof ocExecStream>> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (data: Uint8Array) => {
        if (!closed) controller.enqueue(data);
      };
      const safeClose = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      try {
        sshHandle = await ocExecStream(
          sshConfig,
          cmd,
          (chunk) => {
            // CLI outputs the agent's response as plain text to stdout
            // Stream each chunk as SSE to match frontend expectations
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          },
          (stderrChunk) => {
            // stderr may contain progress/debug info from OpenClaw
            console.log("[chat] stderr:", stderrChunk);
            // Surface actual errors to the client
            if (stderrChunk.includes("error") || stderrChunk.includes("Error")) {
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ error: stderrChunk.trim() })}\n\n`),
              );
            }
          },
        );

        sshHandle.done
          .then((code) => {
            // Clean up temp file (fire-and-forget)
            ocExecStream(
              sshConfig,
              `rm -f ${tmpPath}`,
              () => {},
              () => {},
            ).catch((err) => console.error("[cloud-vm] Failed to clean up temp file:", err));

            if (code !== 0) {
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ error: `Agent exited with code ${code}` })}\n\n`,
                ),
              );
            }
            safeEnqueue(encoder.encode("data: [DONE]\n\n"));
            safeClose();
          })
          .catch(() => {
            safeEnqueue(encoder.encode("data: [DONE]\n\n"));
            safeClose();
          });
      } catch (err) {
        safeEnqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "SSH connection failed" })}\n\n`),
        );
        safeEnqueue(encoder.encode("data: [DONE]\n\n"));
        safeClose();
      }
    },
    cancel() {
      closed = true;
      if (sshHandle) {
        sshHandle.client.end();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
