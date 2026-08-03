import { ResponseType } from "@/types";
import { supabase } from "../supabase";
import { Profile } from "../types";

const PROFILE_BUCKET = "profile";

function isLocalImageUri(value?: string) {
    if (!value) {
        return false;
    }

    return value.startsWith("file://") || value.startsWith("content://") || value.startsWith("data:");
}

export async function uploadProfileImage(userId: string, imageUri: string): Promise<string> {
    if (!imageUri) {
        throw new Error("No image selected");
    }

    const fileName = imageUri.split("/").pop()?.split("?")[0] ?? `${Date.now()}.jpg`;
    const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "jpg";
    const mimeType = extension === "png"
        ? "image/png"
        : extension === "webp"
            ? "image/webp"
            : extension === "gif"
                ? "image/gif"
                : "image/jpeg";
    const safeFileName = `${Date.now()}-${userId}.${extension ?? "jpg"}`;
    const storagePath = `${userId}/${safeFileName}`;

    const response = await fetch(imageUri);

    if (!response.ok) {
        throw new Error("Unable to read the selected image");
    }

    const arrayBuffer = await response.arrayBuffer();
    let lastError: Error | null = null;


    const { data, error } = await supabase.storage.from(PROFILE_BUCKET).upload(storagePath, arrayBuffer, {
        contentType: mimeType,
        upsert: true,
    });

    if (!error && data?.path) {
        const { data: publicUrlData } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(data.path);
        return publicUrlData.publicUrl;
    }

    lastError = error ?? new Error(`Unable to upload image to bucket ${PROFILE_BUCKET}`);

    throw lastError ?? new Error("Unable to upload image to storage");
}

export async function getCurrentUser(
    userId: string
): Promise<Profile | null> {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

    if (error) {
        if (error.code === "PGRST116") {
            return null;
        }

        throw error;
    }

    return data as Profile;
}

export const updateProfile = async (
    userId: string,
    updatedData: Profile
): Promise<ResponseType> => {
    try {
        if (!userId) {
            return { success: false, msg: "You are not authenticated" };
        }

        const avatarUrl = isLocalImageUri(updatedData.avatar_url)
            ? await uploadProfileImage(userId, updatedData.avatar_url as string)
            : updatedData.avatar_url;

        const profilePayload: Profile = {
            ...updatedData,
            avatar_url: avatarUrl,
        };

        const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .update(profilePayload)
            .eq("id", userId)
            .select()
            .single();

        if (profileError) {
            return { success: false, msg: profileError.message };
        }

        const { error: authError } = await supabase.auth.updateUser({
            data: {
                display_name: updatedData.full_name,
                avatar_url: avatarUrl,
            },
        });

        if (authError) {
            return {
                success: false,
                msg: authError.message,
            };
        }

        return { success: true, data: profileData, msg: "Profile updated" };
    } catch (error: any) {
        return { success: false, msg: error?.message };
    }
};
