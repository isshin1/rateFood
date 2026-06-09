import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { useSession, SessionContextType } from "../contexts/SessionContext";

interface ActionMenuProps {
  onEdit: () => void; // Function to open edit dialog
  onDelete: () => void; // Function to handle delete
}

export default function ActionMenu({ onEdit, onDelete }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { session }: SessionContextType = useSession();

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleEdit = () => {
    setOpen(false);
    onEdit(); // This will call handleEdit from DishCard, which opens the dialog
  };

  const handleDelete = () => {
    setOpen(false);
    onDelete(); // This will call onDelete from DishCard
  };

  return (
    <div className="relative right-0" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded-full hover:bg-gray-200 focus:outline-none justify-end"
        aria-label="Open menu"
      >
        <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-5 top-3 mt-0 w-20 bg-white border border-gray-200 rounded-md shadow-lg z-0">
          <button
            onClick={handleEdit}
            className="block w-full text-left px-4 py-1 text-gray-700 hover:bg-gray-100"
          >
            Edit
          </button>

          {session.roles?.includes('ROLE_ADMIN') &&
            <button
              onClick={handleDelete}
              className="block w-full text-left px-4 py-1 text-red-600 hover:bg-red-100"
            >
              Delete
            </button>
          }
        </div>
      )}
    </div>
  );
}