import { cookies } from "next/headers";

export const buildServerApiHeaders = () => {
  const jar = cookies();
  const cookieHeader = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  return {
    Cookie: cookieHeader,
    "x-requested-with": "nextjs"
  } as const;
};
