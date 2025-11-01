const { defaultTemperature, maxTemperature, defaultTopK, maxTopK } =
  await LanguageModel.params();

const available = await LanguageModel.availability();

if (available !== 'unavailable') {
  const session = await LanguageModel.create();
  const schema = {
    "type": "poem"
  };

  const result = await session.prompt(
    `Write me a poem!`,
    {
      responseConstraint: schema,
    }
  );
  console.log(result);
}


const { defaultTemperature, maxTemperature, defaultTopK, maxTopK } =
  await LanguageModel.params();

const available = await LanguageModel.availability();

try {
  const session = await LanguageModel.create();
  const schema = {
    "type": "string"
  };

  const result = await session.prompt(
    `Write me a poem!`,
    {
      responseConstraint: schema
    }
  );
  console.debug(result);
} catch (err) {
  console.error("Error: ", err);
  
}



const available = await LanguageModel.availability();
try{
  const session = await LanguageModel.create();
  let completOutput;  
  const stream = session.promptStreaming('Escribe un array JSON con la lista de tareas para un viaje a la luna. Salida: Solo genera un JSON.');
  for await (const chunk of stream) {
    console.log(chunk);
    completOutput = completOutput + chunk;;
  }
  console.log("Salida completa: \n", completOutput);
} catch (err) {
  console.error("Error: ", err);
} 
  

  comas: 

  const available = await LanguageModel.availability();
try {
  const session = await LanguageModel.create();
  let completOutput = "";
  let buffer = ""; // Buffer para acumular tokens hasta un salto de línea

  const stream = session.promptStreaming('Escribe un array JSON con la lista de tareas para un viaje a la luna. Salida: Solo genera un JSON.');

  for await (const chunk of stream) {
    // 1. Acumular el token en el buffer
    buffer += chunk;
    
    // 2. Comprobar si hay uno o más saltos de línea en el buffer
    if (buffer.includes('\n')) {
      // 3. Dividir el buffer por el salto de línea. El último elemento 
      //    es lo que queda incompleto y debe conservarse.
      const parts = buffer.split('\n');
      
      // 4. Imprimir todas las partes completas (todas menos la última)
      for (let i = 0; i < parts.length - 1; i++) {
        console.log(parts[i]); // Imprime la línea completa
        // Opcional: podrías añadir aquí el salto de línea si quieres que la salida refleje la estructura exacta
        // console.log(parts[i] + '\n'); 
      }
      
      // 5. El último elemento es el inicio de la siguiente línea, se convierte en el nuevo buffer
      buffer = parts[parts.length - 1];
    }
    
    // Acumular la salida completa para el log final
    completOutput += chunk;
  }
  
  // 6. Al finalizar el stream, si queda algo en el buffer, imprimirlo
  if (buffer.length > 0) {
    console.log(buffer);
  }

  console.log("\n--- Salida completa recibida (en crudo) ---\n", completOutput);
} catch (err) {
  console.error("Error: ", err);
}


const available = await LanguageModel.availability();
try {
  const session = await LanguageModel.create();
  let completOutput = "";
  let buffer = ""; // Buffer para acumular tokens hasta un salto de línea
  
  // Lista de tokens estructurales a omitir (después de eliminar espacios)
  const structuralTokensToOmit = ['[', ']', '],', '{', '}', '},'];

  const stream = session.promptStreaming('Escribe un array JSON con la lista de tareas para un viaje a la luna. Salida: Solo genera un JSON.');

  for await (const chunk of stream) {
    // 1. Acumular el token en el buffer
    buffer += chunk;
    
    // 2. Comprobar si hay uno o más saltos de línea en el buffer
    if (buffer.includes('\n')) {
      const parts = buffer.split('\n');
      
      // 3. Procesar e imprimir todas las partes completas (todas menos la última)
      for (let i = 0; i < parts.length - 1; i++) {
        const line = parts[i];
        const trimmedLine = line.trim();
        
        // FILTRADO: Solo imprime si la línea no es uno de los tokens estructurales a omitir
        if (!structuralTokensToOmit.includes(trimmedLine)) {
          console.log(line); // Imprime la línea original (con espacios)
        }
      }
      
      // 4. El último elemento es el inicio de la siguiente línea, se convierte en el nuevo buffer
      buffer = parts[parts.length - 1];
    }
    
    // Acumular la salida completa para el log final
    completOutput += chunk;
  }
  
  // 5. Al finalizar el stream, si queda algo en el buffer, imprimirlo después de filtrarlo
  if (buffer.length > 0) {
    const trimmedLine = buffer.trim();
    if (!structuralTokensToOmit.includes(trimmedLine)) {
        console.log(buffer);
    }
  }

  console.log("\n--- Salida completa recibida (en crudo) ---\n", completOutput);
} catch (err) {
  console.error("Error: ", err);
}
