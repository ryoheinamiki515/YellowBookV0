import type { Connection } from "../api/generated/model/connection";

export interface AvatarPerson {
    displayName: string;
    profileImageUrl?: string | null;
}

export function avatarProps(person: AvatarPerson, nameOverride?: string) {
    return {
        name: nameOverride ?? person.displayName,
        imageUrl: person.profileImageUrl,
    };
}

export function connectionToAvatarPerson(c: Connection): AvatarPerson {
    return {
        displayName: c.targetDisplayName ?? "Connected User",
        profileImageUrl: c.targetProfileImageUrl,
    };
}

export function meToAvatarPerson(me: {
    displayName?: string | null;
    profileImageUrl?: string | null;
}): AvatarPerson {
    return {
        displayName: me.displayName ?? "?",
        profileImageUrl: me.profileImageUrl,
    };
}
