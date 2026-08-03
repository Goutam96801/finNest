import { supabase } from "../supabase";


export async function login(email: string, password: string) {

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) {
        throw new Error(error.message);
    }

    return data;
}

export async function signup(
    email: string,
    password: string,
    displayName: string
) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                display_name: displayName
            },
        },
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

export async function resendOtp(email: string) {

    const { error } = await supabase.auth.resend({
        type: "signup",
        email,
    });

    if (error) {
        throw new Error(error.message);
    }
}

export async function sendPasswordResetOtp(email: string) {

    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: false,
        },
    });

    if (error) {
        throw new Error(error.message);
    }
}

export async function verifyOtp(
    email: string,
    otp: string,
    type: "signup" | "recovery" | "email" | "magiclink" | "invite" | "email_change" = "email"
) {

    const { data, error } = await supabase.auth.verifyOtp({
        token: otp,
        email,
        type,
    });

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

export async function updatePassword(password: string) {

    const { error } = await supabase.auth.updateUser({
        password,
    });

    if (error) {
        throw new Error(error.message);
    }
}

export async function logout() {

    const { error } = await supabase.auth.signOut();

    if (error) {
        throw new Error(error.message);
    }
}