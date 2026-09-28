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
import { Button } from "../ui/button";
import { useUserSettings } from "@/providers/useUserSettings.tsx";

type PropsType = {
  title: string;
  description: string;
  action: string;
  actionCallback: () => void;
  cancel: string;
  cancelCallback: () => void;
  /**
   * Optional third button, set apart at the far left — e.g. "Discard" when the action is
   * "Save". It doesn't close the dialog itself; its callback should, through
   * `setUnsavedChangesAlertOpen(false)`, as the other callers do.
   */
  secondary?: string;
  secondaryCallback?: () => void;
  //   blocker: Blocker;
};

function ProceedWithUnsavedChanges(props: PropsType) {
  const {
    title,
    description,
    action,
    cancel,
    actionCallback,
    cancelCallback,
    secondary,
    secondaryCallback,
  } = props;
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
          {/* The macOS arrangement: the one choice that throws work away sits alone at
              the far left, so a slip off Save can't land on it. */}
          {secondary && secondaryCallback && (
            <Button
              variant="outline"
              className="mt-2 sm:mr-auto sm:mt-0"
              onClick={secondaryCallback}
            >
              {secondary}
            </Button>
          )}
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
