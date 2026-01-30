import { useAuthStore } from '../stores/useAuthStore';
import HAConfiguration from '../components/HAConfig';

export default function Settings() {
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.isSystemAdmin;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-muted">System configuration and settings</p>
      </div>

      {/* High Availability - Admin only */}
      {isAdmin ? (
        <HAConfiguration />
      ) : (
        <div className="card p-8 text-center text-muted">
          <p>No settings available for your account.</p>
          <p className="text-sm mt-2">System settings are managed by administrators.</p>
        </div>
      )}
    </div>
  );
}
