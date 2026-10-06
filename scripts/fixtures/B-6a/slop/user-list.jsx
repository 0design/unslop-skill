import { useQuery } from '@tanstack/react-query';

export function UserList() {
  const { data } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  return <ul>{data.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
