import { useMutation } from "@tanstack/react-query";
import { getAuth } from "@core/db/auth";
import { config } from "@core/config";

async function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

interface SubmitFeedbackParams {
    message: string;
    images: File[];
}

export function useSubmitFeedback() {
    return useMutation({
        mutationFn: async ({ message, images }: SubmitFeedbackParams) => {
            const auth = await getAuth();
            if (!auth?.accessToken) {
                throw new Error("Not authenticated");
            }

            const imageData = await Promise.all(
                images.map(async (file) => ({
                    name: file.name,
                    data: await toBase64(file),
                })),
            );

            const response = await fetch(`${config.authServerUrl}/feedback`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth.accessToken}`,
                },
                body: JSON.stringify({
                    message,
                    images: imageData,
                }),
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(
                    text || `Failed to submit feedback (${response.status})`,
                );
            }

            return response.json() as Promise<unknown>;
        },
    });
}
