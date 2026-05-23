import re
import sys

def main():
    file_path = "e:/IMP projects/Udaya/backend/main.py"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # We will split the content by "async def "
    # For each chunk, if it contains "await " before the next "def " or end of file, we keep it async.
    # Otherwise, we change it to "def "

    new_content = ""
    lines = content.split('\n')
    
    inside_async_def = False
    async_def_body = []
    async_def_signature = ""
    
    output_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        if line.lstrip().startswith("async def "):
            # If we were already collecting a function, process it
            if inside_async_def:
                # check if body has await
                body_text = "\n".join(async_def_body)
                if "await " in body_text:
                    output_lines.append(async_def_signature)
                else:
                    output_lines.append(async_def_signature.replace("async def ", "def ", 1))
                output_lines.extend(async_def_body)
            
            inside_async_def = True
            async_def_signature = line
            async_def_body = []
            
        elif line.lstrip().startswith("def "):
            # Process previous async def if any
            if inside_async_def:
                body_text = "\n".join(async_def_body)
                if "await " in body_text:
                    output_lines.append(async_def_signature)
                else:
                    output_lines.append(async_def_signature.replace("async def ", "def ", 1))
                output_lines.extend(async_def_body)
                inside_async_def = False
            
            output_lines.append(line)
        else:
            if inside_async_def:
                async_def_body.append(line)
            else:
                output_lines.append(line)
        
        i += 1

    # process last
    if inside_async_def:
        body_text = "\n".join(async_def_body)
        if "await " in body_text:
            output_lines.append(async_def_signature)
        else:
            output_lines.append(async_def_signature.replace("async def ", "def ", 1))
        output_lines.extend(async_def_body)

    # Let's also do a global replacement to import asyncio if needed
    result = "\n".join(output_lines)
    
    # We must ensure that broadcast_to_standard's file I/O doesn't block the async event loop too much, 
    # but the main issue is the REST endpoints.
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(result)

    print("Refactoring complete.")

if __name__ == "__main__":
    main()
