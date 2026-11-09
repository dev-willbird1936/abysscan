import React, { useState } from "react";
import { initials } from "../../utils/ocean";

// Avatar content of world.user: initials, or the picture served at /avatars/<id> on the shell
// origin. A picture that cannot load falls back to initials.
const AVATAR_ID = /^[a-z0-9-]{1,40}$/;

export const AvatarFace = ({ user }) => {
  const [failed, setFailed] = useState(null);
  if (user.avatar == "initials" || !AVATAR_ID.test(user.avatar) || failed == user.avatar) return initials(user.name);
  return (
    <img
      className="avatarImg"
      src={`/avatars/${user.avatar}`}
      alt=""
      draggable="false"
      onError={() => setFailed(user.avatar)}
    />
  );
};
