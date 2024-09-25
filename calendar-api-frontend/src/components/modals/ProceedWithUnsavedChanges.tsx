// import { Blocker } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { useUserSettings } from "@/providers/useUserSettings.tsx";

type PropsType = {
  title: string;
  description: string;
  action: string;
  actionCallback: () => void;
  cancel: string;
  cancelCallback: () => void;
  //   blocker: Blocker;
};

function ProceedWithUnsavedChanges(props: PropsType) {
  const { title, description, action, cancel, actionCallback, cancelCallback } =
    props;
  const { unsavedChangesAlertOpen, setUnsavedChangesAlertOpen } =
    useUserSettings();

  return (
    <AlertDialog
      open={unsavedChangesAlertOpen}
      onOpenChange={setUnsavedChangesAlertOpen}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelCallback}>
            {cancel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={actionCallback}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ProceedWithUnsavedChanges;
