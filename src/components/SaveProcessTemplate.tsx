import {useState} from "react";
import {CopyPlus} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {useProcessTemplates} from "@/hooks/use-process-templates";
import {captureProcessTemplate} from "@/lib/task-process-templates";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
export function SaveProcessTemplate({taskId,title,disabled=false}:{taskId:string;title:string;disabled?:boolean}) {
  const templates=useProcessTemplates();
  const [open,setOpen]=useState(false),[name,setName]=useState(""),[saving,setSaving]=useState(false);
  async function save() {
    setSaving(true);
    try {
      // Re-read only the selected task so incomplete/stale dialog data cannot enter a model.
      const task=await supabase.from("tasks").select("id,title,description,priority,assignee_id,column_id,due_date").eq("id",taskId).is("deleted_at",null).single();
      if (task.error) throw task.error;
      const steps:any[]=[];
      for (let offset=0;;offset+=500) {
        const result=await supabase.from("subtasks").select("title,notes,assignee_id,due_date,position").eq("task_id",taskId).order("position").order("id").range(offset,offset+499);
        if(result.error)throw result.error;
        steps.push(...(result.data||[]));if((result.data||[]).length<500)break;
      }
      const where=await templates.save(captureProcessTemplate(task.data,steps,name,crypto.randomUUID(),new Date().toISOString()));
      toast.success(where==="shared"?"Modelo salvo para toda a equipe. A tarefa original foi preservada.":"Modelo salvo neste navegador. A tarefa original foi preservada.");setOpen(false);
    } catch(error) {toast.error((error as Error).message);} finally {setSaving(false);}
  }
  return <><Button type="button" variant="outline" size="sm" disabled={disabled} className="max-md:h-8 max-md:gap-1.5 max-md:rounded-full max-md:px-3 max-md:text-xs" onClick={()=>{setName(title);setOpen(true);}}><CopyPlus className="mr-2 h-4 w-4 max-md:mr-0"/><span className="max-md:hidden">Salvar como modelo</span><span className="md:hidden">Modelo</span></Button>
    <Dialog open={open} onOpenChange={value=>{if(!saving)setOpen(value);}}><DialogContent>
      <DialogTitle>Salvar padrão do processo</DialogTitle><DialogDescription>Preserva o título, a descrição, a ordem das subtarefas e os responsáveis padrão. Cliente, datas fixas, conclusões, comentários e arquivos do atendimento não são copiados.</DialogDescription>
      <Label htmlFor="process-model-name">Nome do modelo</Label><Input id="process-model-name" value={name} onChange={event=>setName(event.target.value)}/>
      <p className="text-xs text-muted-foreground">O modelo usa os dados já salvos da tarefa. Salve suas edições antes de gerar o padrão. O modelo fica disponível para toda a equipe.</p>
      <Button disabled={saving||!name.trim()} onClick={()=>void save()}>{saving?"Salvando…":"Salvar modelo"}</Button>
    </DialogContent></Dialog>
  </>;
}
