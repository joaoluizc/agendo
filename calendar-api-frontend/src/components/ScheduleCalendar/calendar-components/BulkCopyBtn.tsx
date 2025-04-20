import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

function BulkCopyBtn() {
  return (
    <Button variant="ghost" className="h-5 w-fit">
      <Copy style={{ height: "0.9rem", width: "0.9rem" }} />
    </Button>
  );
}

export default BulkCopyBtn;
