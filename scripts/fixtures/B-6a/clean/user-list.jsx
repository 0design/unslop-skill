import { useQuery } from '@tanstack/react-query';

export function UserList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: getUsers });
  if (isLoading) return <Skeleton rows={3} />;
  if (error) return <ErrorState retry={getUsers} />;
  if (data.length === 0) return <EmptyState label="No people yet" />;
  return <ul>{data.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
